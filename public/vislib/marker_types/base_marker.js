define(function (require) {
  return function MarkerFactory() {
    let d3 = require('d3');
    let _ = require('lodash');
    let $ = require('jquery');
    let L = require('leaflet');

    /**
     * Base map marker overlay, all other markers inherit from this class
     *
     * @param map {Leaflet Object}
     * @param geoJson {geoJson Object}
     * @param params {Object}
     */
    function BaseMarker(map, geoJson, layerControl, params) {
      this.map = map;
      this.geoJson = geoJson;
      this.layerControl = layerControl;
      this.popups = [];

      this._tooltipFormatter = params.tooltipFormatter || _.identity;
      this._valueFormatter = params.valueFormatter || _.identity;
      this._attr = params.attr || {};

      // set up the default legend colors
      this.quantizeLegendColors();
    }

    BaseMarker.prototype.getMin = function () {
      const min = _.get(this.geoJson, 'properties.allmin', 0);
      const threshold = _.get(this._attr, 'minThreshold', 0);
      return _.max([min, threshold]);
    }

    /**
     * Adds legend div to each map when data is split
     * uses d3 scale from BaseMarker.prototype.quantizeLegendColors
     *
     * @method addLegend
     * @return {undefined}
     */
    BaseMarker.prototype.addLegend = function () {
      // ensure we only ever create 1 legend
      if (this._legend) return;

      let self = this;

      // create the legend control, keep a reference
      self._legend = L.control({ position: 'bottomright' });

      self._legend.onAdd = function () {
        // creates all the neccessary DOM elements for the control, adds listeners
        // on relevant map events, and returns the element containing the control
        let $div = $('<div>').addClass('tilemap-legend');

        _.each(self._legendColors, function (color, i) {
          let labelText = self._legendQuantizer
            .invertExtent(color)
            .map(self._valueFormatter)
            .join(' – ');

          let label = $('<div>').text(labelText);

          let icon = $('<i>').css({
            background: color,
            'border-color': self.darkerColor(color)
          });

          label.append(icon);
          $div.append(label);
        });

        return $div.get(0);
      };

      self._legend.addTo(self.map);
    };

    /**
     * Apply style with shading to feature
     *
     * @method applyShadingStyle
     * @param value {Object}
     * @return {Object}
     */
    BaseMarker.prototype.applyShadingStyle = function (value) {
      let color = this._legendQuantizer(value);
      if (color == undefined && 'Dynamic - Uneven' === this._attr.scaleType) {
        // Because this scale is threshold based and we added just as many ranges
        // as we did for the domain the max value is counted as being outside the
        // range so we get undefined.  We want to count this as part of the last domain.
        color = this._legendColors[this._legendColors.length - 1];
      }

      return {
        fillColor: color,
        color: this.darkerColor(color),
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.75
      };
    };

    /**
     * Binds popup and events to each feature on map
     * Rewritten by sah
     * 
     * @method bindPopup
     * @param feature {Object}
     * @param layer {Object}
     * return {undefined}
     */
    BaseMarker.prototype.bindPopup = function (feature, layer) {
      let self = this;

      let popup = layer.on({
        //right mouse click
        contextmenu: function (e) {
          let layer = e.target;
          // bring layer to front if not older browser
          if (!L.Browser.ie && !L.Browser.opera) {
            layer.bringToFront();
          }
          if (feature.properties.rectangle) {
            var bounds = {
              "top_left": { lat: feature.properties.rectangle[3][0], lon: feature.properties.rectangle[0][1] },
              "bottom_right": { lat: feature.properties.rectangle[0][0], lon: feature.properties.rectangle[1][1] }
            }
            //must.push(bbox);
            //note:  need to remove any geofilters??

            if (this._map.esFilters) {
              for (var i = 0; i < this._map.esFilters.length; i++) {
                if (this._map.esFilters[i].geo_bounding_box) {
                  this._map.esFilters.splice(i, 1);
                }
              }
            }
            this._map.fire('setfilter:mouseClick', { bounds: bounds });
          }
          return false;

          /*
          if (map.esFilters) {
            //map.esFilters.addFilter()
            
            for (var i = 0; i < map.esFilters.length; i++) {
              if (map.esFilters[i].query) {
                //query.query.filtered.filter.bool.must.push(map.esFilters[i].query)
                must.push(map.esFilters[i].query)
              }
            }
            
          }
          */

          /*
          let lat = _.get(feature, 'geometry.coordinates.1');
          let lng = _.get(feature, 'geometry.coordinates.0');
          //var latLng = L.latLng(lat, lng);
          var sizeInMeters = this._map.bufferDistance ? parseFloat(this._map.bufferDistance) * 1000 : 2 * 1000;

          // @method toBounds(sizeInMeters: Number): LatLngBounds
          // Returns a new `LatLngBounds` object in which each boundary is `sizeInMeters/2` meters apart from the `LatLng`.
          var latAccuracy = 180 * sizeInMeters / 40075017,
            lngAccuracy = latAccuracy / Math.cos((Math.PI / 180) * lat);

          var bounds = {
            "top_left": { lat: lat + latAccuracy, lon: lng - lngAccuracy },
            "bottom_right": { lat: lat - latAccuracy, lon: lng + lngAccuracy }
          }

          this._map.fire('setfilter:mouseClick', { bounds: bounds });
          */
          //this._map.fire('setfilter:id', { id: bounds });
        },

        //dblclick: function (e) {

        //        },
        click: function (e) {
          var map = this._map;
          var oldMapCursor = map.getContainer().style.cursor;
          if (oldMapCursor === undefined) {
            oldMapCursor = 'default';
          }
          var oldBodyCursor = document.body.style.cursor;
          if (oldBodyCursor === undefined) {
            oldBodyCursor = 'default';
          }

          map.getContainer().style.cursor = 'progress'
          document.body.style.cursor = 'progress';
          let layer = e.target;
          // bring layer to front if not older browser
          if (!L.Browser.ie && !L.Browser.opera) {
            layer.bringToFront();
          }

          let lat = _.get(feature, 'geometry.coordinates.1');
          let lng = _.get(feature, 'geometry.coordinates.0');
          var latLng = L.latLng(lat, lng);

          if (e.originalEvent.shiftKey) {
            //https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=-33.8670,151.1957&radius=500&types=food&name=cruise&key=YOUR_API_KEY
            //rankby=distance 
            //https://developers.google.com/places/web-service/search
            //api for geocoding:  
            var url = "/api/sense/proxy?uri=" + escape("https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" + lat + "," + lng + "&rankby=distance&key=AIzaSyCNEMoMEB1daSyHQLLbpUWzURD6RQDuIVw")
            //&radius=500&types=food&name=cruise
            var minWidth = 500
            var options = { "maxWidth": 800, "minWidth": minWidth, offset: new L.Point(0, 0) }
            //, "closeOnClick": true, "closeButton": true, "autoPan": false, "autoClose": true

            var content = "<table><tbody><tr><td><div class='loader'></div></td><td><h4>Loading nearby places</h4></td></tr></tbody></table>";
            //<img src=\"data:image/gif;base64,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\">Loading nearby places</h4></div>"
            var point = map.latLngToContainerPoint(latLng);
            var mapSize = map.getSize();
            //data.results.length

            var buffer = 10;
            //if box overlaps right side
            if (point.x > mapSize.x - (minWidth / 2) - buffer) {
              point.x = mapSize.x - (minWidth / 2) - buffer;
            }
            //if box overlaps left side
            if (point.x < (minWidth / 2)) {
              //add extra to move past map buttons (zoom in/out, etc)
              point.x = (minWidth / 2) + (buffer + 40);
            }
            var adjLatLng = map.containerPointToLatLng(point);
            var layerPopup = L.popup(options)
              .setLatLng(adjLatLng)
              .setContent(content)
              .openOn(map);
            $.ajax({
              method: "POST",
              url: url,
              crossDomain: true,
              async: false,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
              },
              dataType: 'json',
              contentType: 'application/json',
            })
              .done(function (data) {
                // for geohash: " + feature.properties.geohash + "/" + feature.properties.aggConfigResult.value + " estimated results
                //var content = "<h4>Showing: " + data.hits.hits.length + " of " + data.hits.total + " results</h4><table class='' width='800px'><th>&nbsp;</th><th>ID</th><th>Index</th>"
                //var content = "<h4>Showing: " + data.hits.hits.length + " of " + data.hits.total + " results</h4><table width='100%'>"
                var content = "<h4>Nearby establishments, geographic locations, or prominent points of interest</h4><table width='100%'>"

                var fields = [{ "alias": "Place name", "name": "name" }, { "alias": "Types", "name": "types" }];// "vicinity"


                for (var i in fields) {
                  content += "<th>" + fields[i].alias + "</th>";
                  //types" : [ "restaurant", "food", "establishment" ],         "vicinity"
                }
                //<th>AS1</th><th>IP Src</th><th>IP Dest</th>";

                for (var hit in data.results) {
                  //content += "<tr><td><a href='#'>Edit</a></td><td title='" + data.hits.hits[hit]._id + "'>" + hit + "</td><td>" + data.hits.hits[hit]._index + "</td>";
                  content += "<tr>";
                  for (var i in fields) {
                    var str = data.results[hit][fields[i].name];
                    if (str instanceof Array) str = str.join(", ");
                    content += "<td>" + str + "</td>";
                  }
                  content += "</tr>";
                  if (hit >= 19) break;
                  //<td>" + data.hits.hits[hit]._source.as1+ "</td><td>" + data.hits.hits[hit]._source.ipSrc + "</td><td>" + data.hits.hits[hit]._source.ipDst + "</td></tr>"
                }
                content += "</table>"

                var calcHeight = (data.results.length * 25) + 50;
                //if box overlaps top
                if (point.y < calcHeight) {
                  point.y = calcHeight + buffer;
                }
                var adjLatLng = map.containerPointToLatLng(point);

                layerPopup.setLatLng(adjLatLng);
                //layerPopup.options.maxWidth = 600;
                //layerPopup.options.maxHeight = 600;    
                layerPopup.setContent(content);
                layerPopup.update();

              })
              .fail(function (data) {
                console.log(data);
              })
              .always(function () {
                console.log("complete");
                map.getContainer().style.cursor = oldMapCursor;
                document.body.style.cursor = oldBodyCursor;
              });
            return false;
          }



          //var buffer = map.bufferDistance || "0.1km"
          //metersPerPixel = 40075016.686 * Math.abs(Math.cos(map.getCenter().lat * 180 / Math.PI)) / Math.pow(2, map.getZoom() + 8);
          //buffer = (metersPerPixel * parseFloat(map.bufferDistance)) / 1000 + "km"
          //buffer = "1km"

          var from = typeof (map.timeRange.from) == "string" ? new Date(map.timeRange.from).getTime() : map.timeRange.from.toDate().getTime()
          var to = typeof (map.timeRange.to) == "string" ? new Date(map.timeRange.to).getTime() : map.timeRange.to.toDate().getTime()
          var fields = ["asl", "ipDst", "ipSrc"]
          var fields = ["user_id", "speed", "heading", "altitude", "location_timestamp"]
          if (map.popupFields) {
            fields = map.popupFields.split(",");
          }
          var must = []
          if (feature.properties.rectangle) {
            var bbox = {
              "geo_bounding_box": {
                "geocoordinates": {
                  "top_left": {
                    "lat": feature.properties.rectangle[3][0],
                    "lon": feature.properties.rectangle[0][1]
                  },
                  "bottom_right": {
                    "lat": feature.properties.rectangle[0][0],
                    "lon": feature.properties.rectangle[1][1]
                  }
                }
              }
            }
            must.push(bbox);
          }

          if (to && from) {
            var range = {
              "range": {
                "location_timestamp": {
                  "gte": from,
                  "lte": to,
                  "format": "epoch_millis"
                }
              }
            }
            must.push(range);
          }
          if (map.esFilters) {
            for (var i = 0; i < map.esFilters.length; i++) {
              if (map.esFilters[i].query) {
                //query.query.filtered.filter.bool.must.push(map.esFilters[i].query)
                must.push(map.esFilters[i].query)
              }
            }
          }



          //feature.properties.geohash
          var query = {
            "_source": fields,
            "query":
            {
              "filtered":
              {
                "query": {
                  "exists": { "field": "geocoordinates" }
                },
                /*
                "filter": {
                  "geo_distance": {
                    "distance": buffer,
                    "geocoordinates": {
                      "lat": lat,
                      "lon": lng
                    }
                  }
                }
                */
                "filter":
                {
                  "bool":
                  {
                    "must": must
                  }
                }
              }
            }
          };
          /*
          "filter" : {
              "geohash_cell": {
                  "geocoordinates": {
                      "lat": lat,
                      "lon": lng
                  },
                  "precision": 7,
                  "neighbors": true
              }
          }
          */
          /*
          "filter": {
            "geo_distance": {
              "distance": buffer,
              "geocoordinates": {
                "lat": lat,
                "lon": lng
              }
            }
          }
          */
          var content = "<table><tbody><tr><td><div class='loader'></div></td><td><h4>Loading user information</h4></td></tr></tbody></table>";
          var minWidth = 500
          var options = { "maxWidth": 800, "minWidth": minWidth, "closeOnClick": true, "closeButton": true, "autoPan": false, "autoClose": true }
          var point = map.latLngToContainerPoint(latLng);
          var mapSize = map.getSize();

          var buffer = 10;
          //if box overlaps right side
          if (point.x > mapSize.x - (minWidth / 2) - buffer) {
            point.x = mapSize.x - (minWidth / 2) - buffer;
          }
          //if box overlaps left side
          if (point.x < (minWidth / 2)) {
            //add extra to move past map buttons (zoom in/out, etc)
            point.x = (minWidth / 2) + (buffer + 40);
          }
          var adjLatLng = map.containerPointToLatLng(point);
          var layerPopup = L.popup(options)
            .setLatLng(adjLatLng)
            .setContent(content)
            .openOn(map);

          //var url = "http://192.168.99.100:9202/sessions-*/_search";
          //var url = "/api/sense/proxy?uri=http%3A%2F%2F192.168.99.100%3A9202%2Fsessions-*%2F_search";
          //var url = "/elasticsearch/locations/_search?timeout=0&ignore_unavailable=true";
          var url = "/elasticsearch/locations/_search?timeout=0&ignore_unavailable=true";
          //var url = "http://192.168.99.100:9202/sessions-*/_search";
          //var url = "/api/sense/proxy?uri=http%3A%2F%2F192.168.99.100%3A9202%2Fsessions-*%2F_search";
          $.ajax({
            method: "POST",
            url: url,
            crossDomain: true,
            async: false,
            data: JSON.stringify(query),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            dataType: 'json',
            contentType: 'application/json',
          })
            .done(function (data) {
              // for geohash: " + feature.properties.geohash + "/" + feature.properties.aggConfigResult.value + " estimated results
              //var content = "<h4>Showing: " + data.hits.hits.length + " of " + data.hits.total + " results</h4><table class='' width='800px'><th>&nbsp;</th><th>ID</th><th>Index</th>"
              var content = "<h4>Showing: " + data.hits.hits.length + " of " + data.hits.total + " results</h4><table width='100%'>";
              //<i style=\"float:right\" tooltip-placement=\"top\" tooltip=\"Find nearby places\"  ng-click=\"findNearby(" + latLng.lat + "," + latLng.lng + ")\"  class=\"ng-scope\"><ng-md-icon icon=\"mode_edit\" size=\"16\" style=\"fill: #b4bcc2\"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\"><path d=\"M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z\"/> </svg>	</ng-md-icon> </i><table width='100%'>"

              //<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              for (var i in fields) {
                content += "<th>" + fields[i] + "</th>";
              }
              //<th>AS1</th><th>IP Src</th><th>IP Dest</th>";

              for (var hit in data.hits.hits) {
                //content += "<tr><td><a href='#'>Edit</a></td><td title='" + data.hits.hits[hit]._id + "'>" + hit + "</td><td>" + data.hits.hits[hit]._index + "</td>";
                content += "<tr>";
                for (var i in fields) {
                  content += "<td>" + data.hits.hits[hit]._source[fields[i]] + "</td>";
                }
                content += "</tr>";
                //<td>" + data.hits.hits[hit]._source.as1+ "</td><td>" + data.hits.hits[hit]._source.ipSrc + "</td><td>" + data.hits.hits[hit]._source.ipDst + "</td></tr>"
              }
              content += "</table>"

              var calcHeight = (data.hits.hits.length * 25) + 50;
              //if box overlaps top
              if (point.y < calcHeight) {
                point.y = calcHeight + buffer;
              }
              //if box overlaps bottom
              /*
              if(point.y > mapSize.y - calcHeight){
                point.y = mapSize.y - calcHeight - buffer;
              }
              */
              //map.containerPointToLatLng(<Point> point)	LatLng
              var adjLatLng = map.containerPointToLatLng(point);
              layerPopup.setLatLng(adjLatLng);
              //layerPopup.options.maxWidth = 600;
              //layerPopup.options.maxHeight = 600;    
              layerPopup.setContent(content);
              layerPopup.update();


            })
            .fail(function (data) {
              console.log(data);
            })
            .always(function () {
              console.log("complete");
              map.getContainer().style.cursor = oldMapCursor;
              document.body.style.cursor = oldBodyCursor;
            });

          return false;
        }


      });
      return false;
    };

    /*
    mouseover: function (e) {
      let layer = e.target;
      // bring layer to front if not older browser
      if (!L.Browser.ie && !L.Browser.opera) {
        layer.bringToFront();
      }
      self._showTooltip(feature);
    },
    mouseout: function (e) {
      self._hidePopup();
    }
     
    });
    self.popups.push(popup);
    */

    /**
     * d3 method returns a darker hex color,
     * used for marker stroke color
     *
     * @method darkerColor
     * @param color {String} hex color
     * @param amount? {Number} amount to darken by
     * @return {String} hex color
     */
    BaseMarker.prototype.darkerColor = function (color, amount) {
      amount = amount || 1.3;
      return d3.hcl(color).darker(amount).toString();
    };

    BaseMarker.prototype.destroy = function () {
      let self = this;

      this._stopLoadingGeohash();

      // remove popups
      self.popups = self.popups.filter(function (popup) {
        popup.off('mouseover').off('mouseout');
      });
      self._hidePopup();

      if (self._legend) {
        if (self._legend._map) {
          self.map.removeControl(self._legend);
        }
        self._legend = undefined;
      }

      // remove marker layer from map
      if (self._markerGroup) {
        self.layerControl.removeLayer(self._markerGroup);
        if (self.map.hasLayer(self._markerGroup)) {
          self.map.removeLayer(self._markerGroup);
        }
        self._markerGroup = undefined;
      }
    };

    BaseMarker.prototype.hide = function () {
      this._stopLoadingGeohash();
      if (this._legend) {
        this.map.removeControl(this._legend);
      }
    }

    BaseMarker.prototype.show = function () {
      if (this._legend) {
        this._legend.addTo(this.map);
      }
    }

    BaseMarker.prototype.isVisible = function () {
      let visible = false;
      if (this._markerGroup && this.map.hasLayer(this._markerGroup)) {
        visible = true;
      }
      return visible;
    }

    BaseMarker.prototype._addToMap = function () {
      this.layerControl.addOverlay(this._markerGroup, "Aggregation");
      this.map.addLayer(this._markerGroup);
    };

    /**
     * Creates leaflet marker group, passing options to L.geoJson
     *
     * @method _createMarkerGroup
     * @param options {Object} Options to pass to L.geoJson
     */
    BaseMarker.prototype._createMarkerGroup = function (options) {
      let self = this;
      let defaultOptions = {
        onEachFeature: function (feature, layer) {
          self.bindPopup(feature, layer);
        },
        style: function (feature) {
          let value = _.get(feature, 'properties.value');
          return self.applyShadingStyle(value);
        }
      };
      if (self._attr.minThreshold) {
        defaultOptions.filter = function (feature) {
          const value = _.get(feature, 'properties.value', 0);
          return value >= self._attr.minThreshold;
        }
      }

      if (self.geoJson.features.length <= 250) {
        this._markerGroup = L.geoJson(self.geoJson, _.defaults(defaultOptions, options));
      } else {
        //don't block UI when processing lots of features
        this._markerGroup = L.geoJson(self.geoJson.features.slice(0, 100), _.defaults(defaultOptions, options));
        this._stopLoadingGeohash();

        this._createSpinControl();
        var place = 100;
        this._intervalId = setInterval(
          function () {
            var stopIndex = place + 100;
            var halt = false;
            if (stopIndex > self.geoJson.features.length) {
              stopIndex = self.geoJson.features.length;
              halt = true;
            }
            for (var i = place; i < stopIndex; i++) {
              place++;
              self._markerGroup.addData(self.geoJson.features[i]);
            }
            if (halt) self._stopLoadingGeohash();
          },
          200);
      }

      this._addToMap();
    };

    /**
     * Checks if event latlng is within bounds of mapData
     * features and shows tooltip for that feature
     *
     * @method _showTooltip
     * @param feature {LeafletFeature}
     * @param latLng? {Leaflet latLng}
     * @return undefined
     */
    BaseMarker.prototype._showTooltip = function (feature, latLng) {
      if (!this.map) return;
      let lat = _.get(feature, 'geometry.coordinates.1');
      let lng = _.get(feature, 'geometry.coordinates.0');
      latLng = latLng || L.latLng(lat, lng);

      let content = this._tooltipFormatter(feature);

      if (!content) return;
      this._createTooltip(content, latLng);
    };

    BaseMarker.prototype._createTooltip = function (content, latLng) {
      L.popup({ autoPan: false })
        .setLatLng(latLng)
        .setContent(content)
        .openOn(this.map);
    };

    /**
     * Closes the tooltip on the map
     *
     * @method _hidePopup
     * @return undefined
     */
    BaseMarker.prototype._hidePopup = function () {
      if (!this.map) return;

      this.map.closePopup();
    };

    BaseMarker.prototype._createSpinControl = function () {
      if (this._spinControl) return;

      var SpinControl = L.Control.extend({
        options: {
          position: 'topright'
        },
        onAdd: function (map) {
          var container = L.DomUtil.create('div', 'leaflet-control leaflet-spin-control');
          container.innerHTML = '<a class="fa fa-spinner fa-pulse fa-2x fa-fw" href="#" title="Loading Geohash Grids"></a>';
          return container;
        },
        onRemove: function (map) {
        }
      });

      this._spinControl = new SpinControl();
      this.map.addControl(this._spinControl);
    }

    BaseMarker.prototype._removeSpinControl = function () {
      if (!this._spinControl) return;

      this.map.removeControl(this._spinControl);
      this._spinControl = null;
    }

    BaseMarker.prototype._stopLoadingGeohash = function () {
      if (this._intervalId) {
        window.clearInterval(this._intervalId);
      }
      this._intervalId = null;

      this._removeSpinControl();
    }

    /**
     * d3 quantize scale returns a hex color, used for marker fill color
     *
     * @method quantizeLegendColors
     * return {undefined}
     */
    BaseMarker.prototype.quantizeLegendColors = function () {
      if ('Static' === this._attr.scaleType) {
        const domain = [];
        const colors = [];
        this._attr.scaleBands.forEach(function (band) {
          domain.push(band.high);
          colors.push(band.color);
        });
        this._legendColors = colors;
        this._legendQuantizer = d3.scale.threshold().domain(domain).range(this._legendColors);
      } else {
        const min = this.getMin();
        const max = _.get(this.geoJson, 'properties.allmax', 1);
        const range = max - min;
        const quantizeDomain = (min !== max) ? [min, max] : d3.scale.quantize().domain();

        const reds1 = ['#ff6128'];
        const reds3 = ['#fecc5c', '#fd8d3c', '#e31a1c'];
        const reds5 = ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];

        let features = this.geoJson.features;
        if (this._attr.minThreshold) {
          const minThreshold = this._attr.minThreshold;
          features = _.filter(this.geoJson.features, function (feature) {
            const value = _.get(feature, 'properties.value', 0);
            return value >= minThreshold;
          });
        }
        const featureLength = features.length;

        if (featureLength <= 1 || range <= 1) {
          this._legendColors = reds1;
        } else if (featureLength <= 9 || range <= 3) {
          this._legendColors = reds3;
        } else {
          this._legendColors = reds5;
        }
        if ('Dynamic - Linear' == this._attr.scaleType) {
          this._legendQuantizer = d3.scale.quantize().domain(quantizeDomain).range(this._legendColors);
        }
        else { // Dynamic - Uneven
          // A legend scale that will create uneven ranges for the legend in an attempt
          // to split the map features uniformly across the ranges.  Useful when data is unevenly
          // distributed across the minimum - maximum range.
          features.sort(function (x, y) {
            return d3.ascending(x.properties.value, y.properties.value);
          });

          const ranges = [];
          const bands = this._legendColors.length;
          for (let i = 1; i < bands; i++) {
            let index = Math.round(i * featureLength / bands);
            if (index <= featureLength - 1) {
              ranges.push(features[index].properties.value);
            }
          };
          if (ranges.length < bands) {
            ranges.push(max);
          }
          this._legendQuantizer = d3.scale.threshold().domain(ranges).range(this._legendColors);
        }
      }
    };

    return BaseMarker;
  };
});
