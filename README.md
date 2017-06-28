# kibana-4.6.5 customizations
Contains customizations for Kibana 4.6.5 for the enhanced_tilemap and kibana-time-plugins plugins.  Also, contains a modified version of src/ui/public/doc_viewer to allow editing of fields in the table

git clone https://github.com/reaisinc/kibana-4.6.5

To remove the milliseconds from the date displayed in the time plugin under Time Animation, go to Kibana settings, click on the Advanced tab, and set the "dateFormat" field to "MMMM Do YYYY, HH:mm:ss" instead of "MMMM Do YYYY, HH:mm:ss.SSS"

# Install
## Kibana 4.x
Download and unzip Kibana 4.6.4 (or 4.6.5 from git)
https://github.com/elastic/kibana/tree/4.6

Install sense plugin
bin/kibana plugin --install elastic/sense

Note:  kibana often doesn't rebuild/optimize after updating from git, so you may need to delete the "bundles" directory inside the optimize directory, and then start up kibana which will force a rebuild.  Or maybe just delete optimize/bundles/kibana.bundle.js.  Kibana needs an option to force a re-optimize when files are changed.  See https://github.com/elastic/kibana/issues/6057

 ```bash
stop Kibana
rm -Rf optimize/bundles
bin/kibana
``` 

 ```bash
cd kibana-4.6.5
Note: you will need to delete these two files first
src/ui/public/doc_viewer/doc_viewer.html
src/ui/public/doc_viewer/doc_viewer.js

git init
git remote add origin https://github.com/reaisinc/kibana-4.6.5
git pull origin master
git branch --set-upstream-to=origin/master master

```
edit config/kibana.yml and add the url to the ElasticSearch server in two locations:
 ```bash
elasticsearch.url: "http://192.168.99.100:9202"
sense.proxyFilter:
    ^https?://(192\.168\.99\.100:9202|maps\.googleapis\.com|localhost|127\.0\.0\.1|\[::0\]).*
```
# Compatibility
The plugin is compatible with following Versions (other not tested yet):
* kibana (=4.6.5)

