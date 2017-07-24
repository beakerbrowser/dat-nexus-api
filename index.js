/* globals DatArchive */

const {MissingParameterError} = require('./errors')
const CachedFile = require('./cached-file')
const CachedSites = require('./cached-sites')

var otherSitesCache

exports.ProfileSite = class ProfileSite {
  constructor (url) {
    if (!url) {
      throw new MissingParameterError('You must pass a URL to the ProfileSite constructor')
    }
    if (url instanceof DatArchive) {
      this.url = url.url
      this.archive = url
    } else {
      this.url = url
      this.archive = new DatArchive(url)
    }

    // managed data
    this.cache = {
      profile: new CachedFile(this.archive, '/profile.json', {json: true})
    }
    if (!otherSitesCache) {
      otherSitesCache = new CachedSites(ProfileSite)
    }
  }

  // profile data
  // =

  async getProfile () {
    try {
      return await this.cache.profile.get()
    } catch (e) {
      console.debug('Failure reading /profile.json. (This may not be a bug.)', e)
      return {}
    }
  }

  async setProfile (updates) {
    // TODO validate updates?

    // read, update, write profile
    var profile = await this.getProfile()
    Object.assign(profile, updates)
    return await this.cache.profile.put(profile)
  }

  // social relationships
  // =

  async follow (url) {
    // TODO validate URL?

    // read, update, write profile
    var profile = await this.getProfile()
    profile.follows = profile.follows || []
    if (!profile.follows.find(byURL(url))) {
      profile.follows.push({url})
    }
    return await this.cache.profile.put(profile)
  }

  async unfollow (url) {
    // read, update, write profile
    var profile = await this.getProfile()
    profile.follows = profile.follows || []
    var index = profile.follows.findIndex(byURL(url))
    if (index !== -1) {
      profile.follows.splice(index, 1)
    }
    return await this.cache.profile.put(profile)
  }

  async listFollowing (opts) {
    // get profile
    var profile = await this.getProfile()
    var follows = profile.follows || []

    // get followed sites
    var followedSites = await otherSitesCache.get(follows)

    // fetch profiles
    await getRemoteProfiles(followedSites, opts)
    return followedSites
  }

  async listKnownFollowers (opts) {
    return this.listFriends(opts)
  }

  async listFriends (opts) {
    // list following
    var followingSites = await this.listFollowing(opts)

    // filter mutual follows
    return followingSites.filter(site => {
      var follows = site.profile.follows
      if (!follows || !Array.isArray(follows)) {
        return false
      }
      return follows.find(byURL(this.url))
    })
  }

  async isFollowing (url) {
    // get profile
    var profile = await this.getProfile()
    var follows = profile.follows || []

    // find URL
    return !!follows.find(byURL(url))
  }

  async isFriendsWith (url, opts) {
    // get profile
    var profile = await this.getProfile()
    var follows = profile.follows || []

    // find follow
    var follow = follows.find(byURL(url))
    if (!follow) {
      return false
    }

    // load remote profile
    var followedSites = await otherSitesCache.get([follow])
    var followedProfiles = await getRemoteProfiles(followedSites, opts)
    var followedProfile = followedProfiles[0]
    var inverseFollows = followedProfile.follows || []

    // find inverse follow
    return !!inverseFollows.find(byURL(this.url))
  }

  // posting to the feed
  // =

  async broadcast ({text, image, video, audio}) {
    // TODO validate?

    // construct broadcast
    var values = {
      '@context': 'http://schema.org',
      '@type': 'Comment'
    }
    if (text) values.text = text
    if (image) values.image = image
    if (video) values.video = video
    if (audio) values.audio = audio

    // write file
    var path = getBroadcastPath()
    await ensureParentDirectoryExists(this.archive, path)
    await this.archive.writeFile(path, JSON.stringify(values, null, 2))
    await this.archive.commit()
    return this.url + path
  }

  // reading the feed
  // =

  async listBroadcasts (opts) {
    return listFeed([this], opts)
  }

  async listFeed (opts) {
    // get followed sites
    var profile = await this.getProfile()
    var followedSites = await otherSitesCache.get(profile.follows || [])

    // build the feed
    return listFeed([this].concat(followedSites), opts)
  }

  async getBroadcast (path) {
    // load entry if needed
    var entry = path
    if (typeof entry === 'string') {
      entry = await this.archive.stat(path)
    }

    // read and parse
    entry.content = JSON.parse(await this.archive.readFile(entry.name, 'utf8'))

    return entry
  }

  // events
  // =

  async createActivityStream () {
    // TODO
  }
}

// helper fn for find() and findIndex()
function byURL (v) {
  v = normalizeURL(v)
  return obj => normalizeURL(obj.url) === v
}

// helper to load the profiles of multiple remote sites, simultaneously
async function getRemoteProfiles (profileSites, {timeout} = {}) {
  return await Promise.all(profileSites.map(async (profileSite) => {
    try {
      // fetch profile and note that download was successful
      var profile = await profileSite.cache.profile.get({timeout, noCache: true})
      profile.downloaded = true
      profileSite.profile = profile
    } catch (e) {
      if (e.name === 'TimeoutError') {
        // download failure
        profileSite.profile = {
          downloaded: false
        }
      }
      // other failure
      profileSite.profile = {
        downloaded: true
      }
    }
  }))
}

// helper to ensure a target directory is available
async function ensureParentDirectoryExists (archive, path) {
  var pathParts = path.split('/').slice(0, -1) // drop the filename
  for (var i = 1; i <= pathParts.length; i++) {
    try { await archive.mkdir(pathParts.slice(0, i).join('/')) } catch (e) { console.debug(e) }
  }
}

// helper to construct post destinations
var lastUsedTS = 0
function getBroadcastPath () {
  var ts = Date.now()
  if (lastUsedTS === ts) {
    ts++ // cheat to avoid collisions
  }
  lastUsedTS = ts
  return `/broadcasts/${ts}.json`
}

// helper to construct a feed from an arbitrary set of sites
exports.listFeed = listFeed
async function listFeed (sites, {after, before, limit, metaOnly, type, reverse, timeout} = {}) {
  var feed = []
  if (before) before = +before
  if (after) after = +after
  limit = limit || 20

  await Promise.all(sites.map(async site => {
    try {
      // list files
      var names = await site.archive.readdir('/broadcasts', {timeout})
    } catch (e) {
      console.debug(e)
      return
    }

    // grab the site's profile (should be cached in memory)
    var siteProfile = await site.getProfile()

    // parse and filter
    names.forEach(name => {
      // parse create time
      var publishTime = parseBroadcastFilename(name)

      // // filter
      if (!publishTime) return
      if (after && publishTime <= after) return
      if (before && publishTime >= before) return

      // add to feed
      feed.push({
        name,
        publishTime,
        author: site,
        authorProfile: siteProfile,
        url: site.url + names
      })
    })
  }))

  // sort
  if (reverse) {
    feed.sort((a, b) => b.publishTime - a.publishTime)
  } else {
    feed.sort((a, b) => a.publishTime - b.publishTime)
  }

  // limit
  if (limit) {
    feed = feed.slice(0, limit)
  }

  // early finishing condition
  if (metaOnly) {
    return feed
  }

  // read files
  await Promise.all(feed.map(async (entry) => {
    try {
      // read and parse
      entry.content = JSON.parse(await entry.author.archive.readFile(`/broadcasts/${entry.name}`, {encoding: 'utf8', timeout}))
    } catch (e) {
      console.warn('Failed to read file', e)
      entry.error = e
      entry.content = null
    }
  }))
  if (type) {
    // apply type filter
    return feed.filter(entry => {
      return !!entry.content && (entry.content['@type'] || '').toLowerString() === type.toLowerString()
    })
  }
  return feed
}

// helper to pull the timestamp from the broadcast filenames
var bfregex = /([\d]+)\.json$/i
function parseBroadcastFilename (path) {
  var match = bfregex.exec(path)
  if (match) return +match[1]
  return false
}

var urlregex = /(dat:\/\/[^/]*)/i
function normalizeURL (url) {
  var match = urlregex.exec(url)
  if (match) return match[1]
  return false
}
