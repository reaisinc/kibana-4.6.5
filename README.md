# kibana-4.6.5 customizations
Contains customizations for Kibana 4.6.5 for the enhanced_tilemap and kibana-time-plugins plugins.  Also, contains a modified version of src/ui/public/doc_viewer to allow editing of fields in the table

git clone https://github.com/reaisinc/kibana-4.6.5

# Install
## Kibana 4.x
Download and unzip Kibana 4.6.4 (or 4.6.5 from git)
https://github.com/elastic/kibana/tree/4.6

 ```bash
cd kibana-4.6.5
Note: you will need to delete these two files first
*src/ui/public/doc_viewer/doc_viewer.html
*src/ui/public/doc_viewer/doc_viewer.js

git init
git remote add origin https://github.com/reaisinc/kibana-4.6.5
git pull origin master

```
edit config/kibana.yml and add:
 ```bash
elasticsearch.url: "http://192.168.99.100:9202"

tilemap.options.maxZoom: 18
tilemap.url: http://a.tile.openstreetmap.org/{z}/{x}/{y}.png
http.cors.allow-origin: "*"
http.cors.enabled: true

sense.proxyFilter:
    ^https?://(192\.168\.99\.100:9202|maps\.googleapis\.com|localhost|127\.0\.0\.1|\[::0\]).*
```
# Compatibility
The plugin is compatible with following Versions (other not tested yet):
* kibana (=4.6.5)

