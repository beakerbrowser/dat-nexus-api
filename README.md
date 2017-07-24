# Dat Nexus API

An API for reading and writing-to profile archives in the Dat [Nexus App](https://github.com/beakerbrowser/dat-nexus-app). A "Profile Site" is a dat-site which

 1. represents a user (identity),
 2. broadcasts information (media feed), and
 3. and follows other profiles (social relationships).

Nexus Profile Sites are used to identify users and create social feeds.

```js
var {ProfileSite} = require('dat-nexus-api')

// create a profile-site instance
// =

var bob = new ProfileSite(bobsUrl)

// profile data
// =

await bob.getProfile() // => {name:, description:, image:}
await bob.setProfile({name:, description:, image:})

// social relationships
// =

await bob.follow(alicesUrl)
await bob.unfollow(alicesUrl)

await bob.listFollowing() // => [{url:, name:, description:, image:, downloaded:}, ...]
await bob.listKnownFollowers() // => [{url:, name:, description:, image:}, ...]
await bob.listFriends() => [{url:, name:, description:, image:}, ...]

await bob.isFollowing(alicesUrl) // => true
await bob.isFriendsWith(alicesUrl) // => true

// posting to the feed
// =

await bob.broadcast({
  text: 'Hello, world!'
})
await bob.broadcast({
  text: 'Check out my cat!',
  image: '/fluffy.png'
})
await bob.broadcast({
  text: 'Check out my cats!',
  image: ['/fluffy.png', '/jojo.png']
})

// reading the feed
// =

// bob's broadcasts
await bob.listBroadcasts({
  // time slice: between 1-2 hours ago
  after: (Date.now() - 1000 * 60 * 60 * 2),
  before: (Date.now() - 1000 * 60 * 60 * 1)

  limit: 100, // max num of posts
  metaOnly: false, // dont read files, just list entries
  type: 'comment' // filter by broadcast type
})

// bob + followed's broadcasts
await bob.listFeed({
  // same opts as .listBroadcasts()
})

// events
// =

var events = bob.createActivityStream()
events.addEventListener('new-broadcast', ({author, path, ctime, rtime}) => ...)
events.addEventListener('profile-downloaded', ({profile}) => ...)
```

## API

### profile = new nexusApi.ProfileSite(url)

### profile.getProfile()

Get the profile information.

```js
await profile.getProfile() /* => {
  name: String?,
  description: String?,
  image: String? (a file path)
} */
```

### profile.setProfile(data)

Update the profile information. If an attribute is left undefined, no change to the attr is made.

```js
profile.setProfile({
  name: String?,
  description: String?,
  image: String?
})
```

### profile.follow(url)

Add a user to this profile's follows.

### profile.unfollow(url)

Remove a user from this profile's follows.

### profile.listFollowing(opts)

List of users followed by this profile.

```js
await profile.listFollowing({
  timeout: Number, amount of ms to wait until giving up on a profile-download (default 5000)
}) /* => [
  ProfileSite {
    url: String
    profile: {
      name: String?, the user name (not globally unique)
      description: String?, a short bio
      image: String?, path of the profile image
      downloaded: Boolean, has the profile been downloaded?
    }
  }
  ...
] */
```

### profile.listKnownFollowers()

List of users following this profile.

Note: It's not possible to list *all* users following this profile, because the network is decentralized and does not provide global knowledge. This method (currently) is equivalent to `listFriends` but may in the future include more users.

```js
await profile.listKnownFollowers() /* => [
  ProfileSite {
    url: String
    profile: {
      name: String?
      description: String?
      image: String?
    }
  }
  ...
] */
```

### profile.listFriends()

List of users following this profile, which are also followed by this profile.

```js
await profile.listFriends() /* => [
  ProfileSite {
    url: String
    profile: {
      name: String?
      description: String?
      image: String?
    }
  }
  ...
] */
```

### profile.isFollowing(url)

Is the profile following the given URL?

```js
await profile.isFollowing(String) // => Boolean
```

### profile.isFriendsWith(url)

Is the profile following the given URL, and followed by the given URL?

```js
await profile.isFriendsWith(String) // => Boolean
```

### profile.broadcast(data)

Post a new broadcast.

```js
await profile.broadcast({
  text:  String?, the text of the broadcast
  image: [String] | String | undefined, a URL or URLs
  video: [String] | String | undefined, a URL or URLs
  audio: [String] | String | undefined, a URL or URLs
})
```

### profile.listBroadcasts(opts)

List broadcasts authored by the profile.

```js
await profile.listBroadcasts({
  after:    Date | Number | undefined, a date or epoch number
  before:   Date | Number | undefined, a date or epoch number
  limit:    Number?, the max number of posts to return. Default 20.
  reverse:  Boolean?, if true will provide oldest first
  metaOnly: Boolean?, provide file-entry descriptors instead of reading content
  type:     String?, a filter on the type of broadcast. Does not work with 'metaOnly==true'.
  timeout:  Number?, the timeout for each operation. Default 5000. (Note: There are multiple operations.)
}) => /* [
  {
    author: ProfileSite, the broadcast author
    authorProfile: Object, the profile of the author (same content as getProfile())
    name: String, the file path
    ctime: Number, creation time
    mtime: Number, modification time
    content: {
      "@type": String, the broadcast type (eg 'Comment')
      text: String, the text of the broadcast
      image: [String] | String | undefined, a URL or URLs
      video: [String] | String | undefined, a URL or URLs
      audio: [String] | String | undefined, a URL or URLs
    }
  }
] */
```

### profile.listFeed(opts)

List broadcasts authored by the profile and its followed profiles.

```js
await profile.listFeed({
  after:    Date | Number | undefined, a date or epoch number
  before:   Date | Number | undefined, a date or epoch number
  limit:    Number?, the max number of posts to return. Default 20.
  reverse:  Boolean?, if true will provide oldest first
  metaOnly: Boolean?, provide file-entry descriptors instead of reading content
  type:     String?, a filter on the type of broadcast. Does not work with 'metaOnly==true'.
  timeout:  Number?, the timeout for each operation. Default 5000. (Note: There are multiple operations.)
}) => /* [
  {
    author: ProfileSite, the broadcast author
    authorProfile: Object, the profile of the author (same content as getProfile())
    name: String, the file path
    ctime: Number, creation time
    mtime: Number, modification time
    content: {
      "@type": String, the broadcast type (eg 'Comment')
      text: String, the text of the broadcast
      image: [String] | String | undefined, a URL or URLs
      video: [String] | String | undefined, a URL or URLs
      audio: [String] | String | undefined, a URL or URLs
    }
  }
] */
```

### profile.getBroadcast(path)

Read the given broadcast object. Will throw with `InvalidBroadcastFileError` if the file does not conform to the format or schema.

```js
await profile.getBroadcast(String) /* => {
  name: String, the file path
  ctime: Number, creation time
  mtime: Number, modification time
  content {
    '@context': 'http://schema.org',
    '@type': 'Comment',
    text: String?, the text of the broadcast
    image: [String] | String | undefined, a URL or URLs
    video: [String] | String | undefined, a URL or URLs
    audio: [String] | String | undefined, a URL or URLs
  }
}*/
```

### var events = profile.createActivityStream()

### events.addEventListener('new-broadcast')

Emitted when a new broadcast has been received from the profile or one of the followed profiles. Will not be emitted for broadcasts which were not created in the past 24 hours.

```js
events.addEventListener('new-broadcast', event => {
  /*
  event.author: String, the url of the author
  event.path: String, the path of the new broadcast
  event.ctime: Number, the timestamp of the creation of the broadcast
  event.rtime: Number, the timestamp of the when the broadcast was received
  */
})
```

### events.addEventListener('profile-downloaded')

Emitted when an undownloaded profile is first discovered on the network and downloaded.

```js
events.addEventListener('profile-downloaded', event => {
  /*
  event.profile: String, the url of the profile
  */
})
```

### listFeed(profiles, opts)

List broadcasts authored by the given profiles.

```js
await profile.listFeed({
  after:    Date | Number | undefined, a date or epoch number
  before:   Date | Number | undefined, a date or epoch number
  limit:    Number?, the max number of posts to return. Default 20.
  reverse:  Boolean?, if true will provide oldest first
  metaOnly: Boolean?, provide file-entry descriptors instead of reading content
  type:     String?, a filter on the type of broadcast. Does not work with 'metaOnly==true'.
  timeout:  Number?, the timeout for each operation. Default 5000. (Note: There are multiple operations.)
}) => /* [
  {
    author: ProfileSite, the broadcast author
    authorProfile: Object, the profile of the author (same content as getProfile())
    name: String, the file path
    ctime: Number, creation time
    mtime: Number, modification time
    content: {
      "@type": String, the broadcast type (eg 'Comment')
      text: String, the text of the broadcast
      image: [String] | String | undefined, a URL or URLs
      video: [String] | String | undefined, a URL or URLs
      audio: [String] | String | undefined, a URL or URLs
    }
  }
] */
```

## Files Spec

This page specifies the required file paths, formats, and schemas to conform to the Profile Site Protocol. Conformance allows feed applications to consume the target site and render their content correctly.

#### Notes

 - All linked assets (images, videos, etc) must be hosted on the site. Cross-origin embedding is not allowed.
 - Linked assets should only use absolute paths or absolute urls. Relative paths such as `./image.png` are not supported.

### Profile Data (Required)

The profile data of the site provides a name, short biography, and image.

#### Path

```
/profile.json
```

#### Format

Format|Spec
------|----
json-ld|http://json-ld.org/

#### Schema

Type|Spec|Implemented Attributes
----|----|----------------------
person|https://schema.org/Person |name, image, description, follows

#### Example

```js
// /profile.json
{
  "@context": "http://schema.org",
  "@type": "Person",
  "name": "Alice Roberts",
  "image": "/profile.jpg",
  "description": "Finally trying out this 'Dat' thing!",
  "follows": [
    {"url": "dat://.../"},
    {"url": "dat://.../"},
    {"url": "dat://.../"}
  ]
}
```

### Broadcasts (Optional)

"Broadcasts" are content which should be visible to all audiences, and requires no context to be displayed. Broadcasts are conceptually similar to tweets.

A site may have many broadcasts.

#### Path

Files that match this pattern will be placed in the broadcast feed. Any other files will be ignored; related files (such as images or videos) can be placed in the broadcasts folder.

```
/broadcasts/{timestamp}.json
```

The `timestamp` is a Unix epoch number.

Example path for "A comment posted at Sat Mar 25 2017 16:51:18."

```
/broadcasts/1490478678636.json
```

#### Format

Format|Spec
------|----
json-ld|http://json-ld.org/

#### Schema

Type|Spec|Implemented Attributes
----|----|----------------------
comment|https://schema.org/Comment |text, image, video, audio

#### Example: Simple comment

```js
// /broadcasts/1490478678636.json
{
  "@context": "http://schema.org",
  "@type": "Comment",
  "text": "Hello, world!"
}
```

#### Example: Share image

```js
// /broadcasts/1490478678637.json
{
  "@context": "http://schema.org",
  "@type": "Comment",
  "text": "Check out my awesome cat!",
  "image": "/pics/cat.jpeg"
}
```
