const test = require('ava')
const DatArchive = require('node-dat-archive')
const tempy = require('tempy')
const NexusAPI = require('../')

var alice
var bob
var carla

test('construct some archives with a guest session', async t => {
  await NexusAPI.open()

  // create the archives
  ;[alice, bob, carla] = await Promise.all([
    DatArchive.create({title: 'Alice', localPath: tempy.directory()}),
    DatArchive.create({title: 'Bob', localPath: tempy.directory()}),
    DatArchive.create({title: 'Carla', localPath: tempy.directory()})
  ])

  // add to nexus
  await NexusAPI.addArchives([alice, bob, carla])

  // write profiles
  await NexusAPI.setProfile(alice, {
    name: 'Alice',
    bio: 'A cool hacker girl',
    avatar: 'alice.png',
    follows: [{name: 'Bob', url: bob.url}, {name: 'Carla', url: carla.url}]
  })
  await NexusAPI.setProfile(bob, {
    name: 'Bob',
    bio: 'A cool hacker guy',
    avatar: 'bob.png'
  })
  await NexusAPI.follow(bob, alice, 'Alice')
  await NexusAPI.setProfile(carla, {
    name: 'Carla'
  })
  await NexusAPI.follow(carla, alice)

  // verify data
  t.deepEqual(await NexusAPI.getProfile(alice), {
    _origin: alice.url,
    _url: alice.url + '/profile.json',
    name: 'Alice',
    bio: 'A cool hacker girl',
    avatar: '/alice.png',
    followUrls: [bob.url, carla.url],
    follows: [{name: 'Bob', url: bob.url}, {name: 'Carla', url: carla.url}]
  })
  t.deepEqual(await NexusAPI.getProfile(bob), {
    _origin: bob.url,
    _url: bob.url + '/profile.json',
    name: 'Bob',
    bio: 'A cool hacker guy',
    avatar: '/bob.png',
    followUrls: [alice.url],
    follows: [{name: 'Alice', url: alice.url}]
  })
  t.deepEqual(await NexusAPI.getProfile(carla), {
    _origin: carla.url,
    _url: carla.url + '/profile.json',
    name: 'Carla',
    bio: null,
    avatar: null,
    followUrls: [alice.url],
    follows: [{url: alice.url, name: null}]
  })

  await NexusAPI.close()
})
