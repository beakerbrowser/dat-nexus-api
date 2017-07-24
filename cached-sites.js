module.exports = class CachedSites {
  constructor (ProfileSite) {
    this.ProfileSite = ProfileSite
    this.sites = {}
  }

  get (descriptors) {
    return descriptors.map(d => {
      if (d.url in this.sites) {
        return this.sites[d.url]
      }
      this.sites[d.url] = new (this.ProfileSite)(d.url)
      return this.sites[d.url]
    })
  }
}
