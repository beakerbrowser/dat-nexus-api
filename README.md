# Dat Nexus API

An API for reading and writing-to profile archives in the Dat [Nexus App](https://github.com/beakerbrowser/dat-nexus-app). A "Profile Site" is a dat-site which

 1. represents a user (identity),
 2. broadcasts information (media feed), and
 3. and follows other profiles (social relationships).

Nexus Profile Sites are used to identify users and create social feeds.

```js
var NexusAPI = require('dat-nexus-api')

// create a db instance
var db = await NexusAPI.open(/* cache session */)
var db = await NexusAPI.open(mainUserArchive) // mainUserArchive is a DatArchive instance

// profile data
// =

await db.getProfile() // => {name:, bio:, avatar:}
await db.setProfile({name:, bio:, avatar:})

// management
// =

await db.close(destroy: Boolean) // close db instance, optionally delete its data

await db.addArchive(archive) // add archive to the db
await db.addArchives(archives) // add archives to the db
await db.removeArchive(archive) // remove archive from the db
db.listArchives() // list archives in the db
await db.pruneUnfollowedArchives(mainUserArchive) // remove archives from the db that arent followed by mainUserArchive

// social relationships
// =

await db.follow(userArchive, targetUser, targetUserName?)
await db.unfollow(userArchive, targetUser)

db.getFollowersQuery(userArchive) // get InjestRecordSet for a followers query
await db.listFollowers(userArchive) // list users in db that follow the user
await db.countFollowers(userArchive) // count users in db that follow the user
await db.listFriends(userArchive) // list users in db that mutually follow the user
await db.countFriends(userArchive) // count users in db that mutually follow the user

await db.isFollowing(archiveA, archiveB) // => true
await db.isFriendsWith(archiveA, archiveB) // => true

// posting to the feed
// =

await db.broadcast(userArchive, {
  text: 'Hello, world!',
})

// posting a reply
await db.broadcast(userArchive, {
  text: 'Hello, world!',
  threadParent: parent._url, // url of message replying to
  threadRoot: top._url // url of topmost ancestor message - defaults to threadParent's value
})

// reading the feed
// =

// get InjestRecordSet for a broadcasts query
db.getBroadcastsQuery({
  author: url | DatArchive,
  after: timestamp,
  before: timestamp,
  offset: number,
  limit: number,
  reverse: boolean
})

// get broadcast records
await db.listBroadcasts({
  // all opts from getBroadcastsQuery, plus:
  fetchAuthor: boolean,
  fetchReplies: boolean,
  countVotes: boolean
})

await db.countBroadcasts(/* same opts for getBroadcastsQuery */)
await db.getBroadcast(url)

// votes
// =

await db.vote (userArchive, {vote, subject})
// vote should be -1, 0, or 1
// subject should be a dat url

db.getVotesQuery(subject)
await db.listVotes(subject)

// this returns {up: number, down: number, value: number, upVoters: array of urls, currentUsersVote: number}
async db.countVotes(subject)
```
