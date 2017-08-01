const InjestDB = require('injestdb')
const coerce = require('./lib/coerce')

// globals
// =

var db

// exported api
// =

exports.open = async function (userArchive) {
  // setup the archive
  db = new InjestDB('nexus:' + (userArchive ? userArchive.url : 'guest'))
  db.schema({
    version: 1,
    profile: {
      singular: true,
      index: ['*followUrls'],
      validator: record => ({
        name: coerce.string(record.name),
        bio: coerce.string(record.bio),
        avatar: coerce.path(record.avatar),
        follows: coerce.arrayOfFollows(record.follows),
        followUrls: coerce.arrayOfFollows(record.follows).map(f => f.url)
      })
    },
    broadcasts: {
      primaryKey: 'createdAt',
      index: ['createdAt', '_origin+createdAt', 'threadRoot', 'threadParent'],
      validator: record => ({
        text: coerce.string(record.text),
        threadRoot: coerce.datUrl(record.threadRoot),
        threadParent: coerce.datUrl(record.threadParent),
        createdAt: coerce.number(record.createdAt, {required: true}),
        receivedAt: Date.now()
      })
    },
    votes: {
      primaryKey: 'subject',
      index: ['subject'],
      validator: record => ({
        subject: encodeURIComponent(coerce.datUrl(record.subject)),
        vote: coerce.vote(record.vote),
        createdAt: coerce.number(record.createdAt, {required: true})
      })
    }
  })
  await db.open()

  if (userArchive) {
    // index the main user
    await db.addArchive(userArchive, {prepare: true})

    // index the followers
    db.profile.get(userArchive).then(async profile => {
      profile.followUrls.forEach(url => db.addArchive(url))
    })
  }
}

exports.close = async function (destroy) {
  if (db) {
    var name = db.name
    await db.close()
    if (destroy) {
      await InjestDB.delete(name)
    }
    db = null
  }
}

exports.getDb = function () { return db }

exports.addArchive = a => db.addArchive(a, {prepare: true})
exports.addArchives = as => db.addArchives(as, {prepare: true})
exports.removeArchive = a => db.removeArchive(a)
exports.listArchives = () => db.listArchives()

exports.pruneUnfollowedArchives = async function (userArchive) {
  var profile = await db.profile.get(userArchive)
  var archives = db.listArchives()
  await Promise.all(archives.map(a => {
    if (profile.followUrls.indexOf(a.url) === -1) {
      return db.removeArchive(a)
    }
  }))
}

// profiles api
// =

exports.getProfile = function (archive) {
  var archiveUrl = coerce.archiveUrl(archive)
  return db.profile.get(archiveUrl)
}

exports.setProfile = function (archive, profile) {
  var archiveUrl = coerce.archiveUrl(archive)
  return db.profile.upsert(archiveUrl, profile)
}

exports.follow = async function (archive, target, name) {
  var archiveUrl = coerce.archiveUrl(archive)
  var targetUrl = coerce.archiveUrl(target)
  var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
    record.follows = record.follows || []
    if (!record.follows.find(f => f.url === targetUrl)) {
      record.follows.push({url: targetUrl, name})
    }
    return record
  })
  if (changes === 0) {
    throw new Error('Failed to follow: no profile record exists. Run setProfile() before follow().')
  }
  await db.addArchive(target)
}

exports.unfollow = async function (archive, target) {
  var archiveUrl = coerce.archiveUrl(archive)
  var targetUrl = coerce.archiveUrl(target)
  var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
    record.follows = record.follows || []
    record.follows = record.follows.filter(f => f.url !== targetUrl)
    return record
  })
  if (changes === 0) {
    throw new Error('Failed to unfollow: no profile record exists. Run setProfile() before unfollow().')
  }
}

exports.getFollowersRecordSet = function (archive) {
  var archiveUrl = coerce.archiveUrl(archive)
  return db.profile.where('followUrls').equals(archiveUrl)
}

exports.listFollowers = function (archive) {
  return exports.getFollowersRecordSet(archive).toArray()
}

exports.countFollowers = function (archive) {
  return exports.getFollowersRecordSet(archive).count()
}

exports.isFollowing = async function (archiveA, archiveB) {
  var archiveBUrl = coerce.archiveUrl(archiveB)
  var profileA = await db.profile.get(archiveA)
  return profileA.followUrls.indexOf(archiveBUrl) !== -1
}

exports.listFriends = async function (archive) {
  var followers = await exports.listFollowers(archive)
  await Promise.all(followers.map(async follower => {
    follower.isFriend = await exports.isFollowing(archive, follower.url)
  }))
  return followers.filter(f => f.isFriend)
}

exports.countFriends = async function (archive) {
  var friends = await exports.listFriends(archive)
  return friends.length
}

exports.isFriendsWith = async function (archiveA, archiveB) {
  var [a, b] = await Promise.all([
    exports.isFollowing(archiveA, archiveB),
    exports.isFollowing(archiveB, archiveA)
  ])
  return a && b
}

// broadcasts api
// =

exports.broadcast = function (archive, {text, threadRoot, threadParent}) {
  text = coerce.string(text)
  const threadRootUrl = threadRoot ? coerce.recordUrl(threadRoot) : undefined
  const threadParentUrl = threadParent ? coerce.recordUrl(threadParent) : undefined
  if (!text) throw new Error('Must provide text')
  if (!!threadRootUrl !== !!threadParentUrl) throw new Error('Must provide both threadRoot and threadParent or neither')
  const createdAt = Date.now()
  return db.broadcasts.add(archive, {text, threadRoot, threadParent, createdAt})
}

exports.getBroadcastsRecordSet = function ({author, after, before, offset, limit, type, reverse} = {}) {
  var query = db.broadcasts
  if (author) {
    author = coerce.archiveUrl(author)
    after = after || 0
    before = before || Infinity
    query = query.where('_origin+createdAt').between([author, after], [author, before])
  } else if (after || before) {
    after = after || 0
    before = before || Infinity
    query = query.where('createdAt').between(after, before)
  } else {
    query = query.orderBy('createdAt')
  }
  if (offset) query = query.offset(offset)
  if (limit) query = query.limit(limit)
  if (reverse) query = query.reverse()
  return query
}

exports.listBroadcasts = async function (opts) {
  var broadcasts = await exports.getBroadcastsRecordSet(opts).toArray()
  if (opts && opts.fetchAuthor) {
    let profiles = {}
    await Promise.all(broadcasts.map(async b => {
      if (!profiles[b._origin]) {
        profiles[b._origin] = exports.getProfile(b._origin)
      }
      b.author = await profiles[b._origin]
    }))
  }
  return broadcasts
}

exports.countBroadcasts = function (opts) {
  return exports.getBroadcastsRecordSet(opts).count()
}

exports.getBroadcast = function (record) {
  const recordUrl = coerce.recordUrl(record)
  return db.broadcasts.get(recordUrl)
}

// votes api
// =

exports.vote = function (archive, {vote, subject}) {
  vote = coerce.vote(vote)
  if (!subject) throw new Error('Subject is required')
  if (subject._url) subject = subject._url
  if (subject.url) subject = subject.url
  subject = coerce.datUrl(subject)
  const createdAt = Date.now()
  return db.votes.add(archive, {vote, subject, createdAt})
}

exports.getVotesRecordSet = function (subject) {
  return db.votes.where('subject').equals(encodeURIComponent(subject))
}

exports.listVotes = function (subject) {
  return exports.getVotesRecordSet(subject).toArray()
}

exports.countVotes = async function (subject) {
  var res = {up: 0, down: 0, value: 0}
  await exports.getVotesRecordSet(subject).each(record => {
    res.value += record.vote
    if (record.vote === 1) res.up++
    if (record.vote === -1) res.down--
  })
  return res
}

