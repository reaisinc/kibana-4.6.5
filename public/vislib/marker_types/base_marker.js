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
        },
        click: function (e) {
          let layer = e.target;
          // bring layer to front if not older browser
          if (!L.Browser.ie && !L.Browser.opera) {
            layer.bringToFront();
          }
          var map = this._map;
          let lat = _.get(feature, 'geometry.coordinates.1');
          let lng = _.get(feature, 'geometry.coordinates.0');
          var latLng = L.latLng(lat, lng);
          var url = ""
          var buffer = map.bufferDistance || "0.1km"
          metersPerPixel = 40075016.686 * Math.abs(Math.cos(map.getCenter().lat * 180 / Math.PI)) / Math.pow(2, map.getZoom() + 8);
          buffer = (metersPerPixel * parseFloat(map.bufferDistance)) / 1000 + "km"
          //buffer = "1km"

          var from = typeof (map.timeRange.from) == "string" ? new Date(map.timeRange.from).getTime() : map.timeRange.from.toDate().getTime()
          var to = typeof (map.timeRange.to) == "string" ? new Date(map.timeRange.to).getTime() : map.timeRange.to.toDate().getTime()
          var fields = ["asl", "ipDst", "ipSrc"]
          var fields = ["user_id", "speed", "heading", "altitude", "location_timestamp"]
          if (map.popupFields) {
            fields = map.popupFields.split(",");
          }
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
          var range = {
            "range": {
              "location_timestamp": {
                "gte": from,
                "lte": to,
                "format": "epoch_millis"
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
                    "must": [
                      bbox,
                      range
                      /*
                      {
                        "geo_distance": {
                          "distance": buffer,
                          "geocoordinates": {
                            "lat": lat,
                            "lon": lng
                          }
                        }
                      },
                      */
                    ]
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
          if (map.esFilters) {
            for (var i = 0; i < map.esFilters.length; i++) {
              query.query.filtered.filter.bool.must.push(map.esFilters[i].query)
            }
          }

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
              var content = "<h4>Showing: " + data.hits.hits.length + " of " + data.hits.total + " results</h4><table class='' width='800px'><th>&nbsp;</th><th>ID</th><th>Index</th>"
              for (var i in fields) {
                content += "<th>" + fields[i] + "</th>";
              }
              //<th>AS1</th><th>IP Src</th><th>IP Dest</th>";
              
              for (var hit in data.hits.hits) {
                content += "<tr><td><a href='#'>Edit</a></td><td title='" + data.hits.hits[hit]._id + "'>" + hit + "</td><td>" + data.hits.hits[hit]._index + "</td>";
                for (var i in fields) {
                  content += "<td>" + data.hits.hits[hit]._source[fields[i]] + "</td>";
                }
                content += "</tr>";
                //<td>" + data.hits.hits[hit]._source.as1+ "</td><td>" + data.hits.hits[hit]._source.ipSrc + "</td><td>" + data.hits.hits[hit]._source.ipDst + "</td></tr>"
              }
              content += "</table>"
              var options = { "maxWidth": 1000, "minWidth": 800, "closeOnClick": true, "closeButton": true }
              layerPopup = L.popup(options)
                .setLatLng(latLng)
                .setContent(content)
                .openOn(map);

            })
            .fail(function (data) {
              console.log(data);
            });
        }
      });
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
