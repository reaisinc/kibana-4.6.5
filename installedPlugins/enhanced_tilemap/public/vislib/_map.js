import { markerIcon } from 'plugins/enhanced_tilemap/vislib/markerIcon';

define(function (require) {
  return function MapFactory(Private) {
    var _ = require('lodash');
    var $ = require('jquery');
    var L = require('leaflet');
    var LDrawToolbench = require('./LDrawToolbench');
    const utils = require('plugins/enhanced_tilemap/utils');
    var formatcoords = require('./../lib/formatcoords/index');
    require('./../lib/leaflet.mouseposition/L.Control.MousePosition.css');
    require('./../lib/leaflet.mouseposition/L.Control.MousePosition');
    require('./../lib/leaflet.setview/L.Control.SetView.css');
    require('./../lib/leaflet.setview/L.Control.SetView');
    require('./../lib/leaflet.measurescale/L.Control.MeasureScale.css');
    require('./../lib/leaflet.measurescale/L.Control.MeasureScale');
    //add ESRI sah
    require('./../lib/leaflet.esri/esri-leaflet');
    var syncMaps = require('./sync_maps');

    var defaultMapZoom = 2;
    var defaultMapCenter = [15, 5];
    var defaultMarkerType = 'Scaled Circle Markers';

    var mapTiles = {
      url: 'http://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        attribution: 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
      }
    };
    var markerTypes = {
      'Scaled Circle Markers': Private(require('./marker_types/scaled_circles')),
      'Shaded Circle Markers': Private(require('./marker_types/shaded_circles')),
      'Shaded Geohash Grid': Private(require('./marker_types/geohash_grid')),
      'Heatmap': Private(require('./marker_types/heatmap')),
    };
    //default ESRI basemap - added sah 
    var esriBasemap = "Streets";
    var bufferDistance = "2km";

    /**
     * Tile Map Maps
     *
     * @class Map
     * @constructor
     * @param container {HTML Element} Element to render map into
     * @param params {Object} Parameters used to build a map
     */
    function TileMapMap(container, params) {
      this._container = container;
      this._poiLayers = {};
      this._wmsOverlays = [];

      // keep a reference to all of the optional params
      this._callbacks = _.get(params, 'callbacks');
      this._setMarkerType(params.mapType);
      const centerArray = _.get(params, 'center') || defaultMapCenter;
      this._mapCenter = L.latLng(centerArray[0], centerArray[1]);
      this._mapZoom = _.get(params, 'zoom') || defaultMapZoom;
      this._setAttr(params.attr);
      this._isEditable = params.editable || false;
      this._esriBasemap = params.esriBasemap;
      this._bufferDistance = "2km";
      this.zoomToFeatures = false;
      var mapOptions = {
        minZoom: 1,
        maxZoom: 18,
        noWrap: true,
        maxBounds: L.latLngBounds([-90, -220], [90, 220]),
        scrollWheelZoom: _.get(params.attr, 'scrollWheelZoom', true),
        fadeAnimation: false,
        esriBasemap: params.esriBasemap,
      };

      this._createMap(mapOptions);
    }

    TileMapMap.prototype._addDrawControl = function () {
      if (this._drawControl) return;

      //create Markers feature group and add saved markers 
      this._drawnItems = new L.FeatureGroup();
      var self = this;
      this._attr.markers.forEach(function (point) {
        let color = 'green';
        if (point.length === 3) {
          color = point.pop();
        }
        self._drawnItems.addLayer(
          L.marker(
            point,
            { icon: markerIcon(color) }));
      });
      this.map.addLayer(this._drawnItems);
      this._layerControl.addOverlay(this._drawnItems, "Markers");

      //https://github.com/Leaflet/Leaflet.draw
      const drawOptions = {
        draw: {
          circle: false,
          marker: {
            icon: markerIcon('green')
          },
          polygon: {},
          polyline: false,
          rectangle: {
            shapeOptions: {
              stroke: false,
              color: '#000'
            }
          }
        },
        edit: {
          featureGroup: this._drawnItems,
          edit: false
        }
      }
      //Do not show marker and remove buttons when visualization is displayed in dashboard, i.e. not editable 
      if (!this._isEditable) {
        drawOptions.draw.marker = false;
        drawOptions.edit.remove = false;
      }

      this._drawControl = new L.Control.Draw(drawOptions);
      this.map.addControl(this._drawControl);

      this._toolbench = new LDrawToolbench(this.map, this._drawControl);
    };

    TileMapMap.prototype._addSetViewControl = function () {
      if (this._setViewControl) return;

      this._setViewControl = new L.Control.SetView();
      this.map.addControl(this._setViewControl);
    };

    TileMapMap.prototype._addMousePositionControl = function () {
      if (this._mousePositionControl) return;

      const dd = function (val) {
        return L.Util.formatNum(val, 5);
      }
      const space = "replaceMe";
      this._mousePositionControl = L.control.mousePosition({
        emptyString: '',
        lngFormatters: [
          dd,
          function (lon) {
            var dms = formatcoords(0, lon).format('DD MM ss X', {
              latLonSeparator: space,
              decimalPlaces: 2
            });
            return dms.substring(dms.indexOf(space) + space.length);
          }
        ],
        latFormatters: [
          dd,
          function (lat) {
            var dms = formatcoords(lat, 0).format('DD MM ss X', {
              latLonSeparator: space,
              decimalPlaces: 2
            });
            return dms.substring(0, dms.indexOf(space));
          }
        ]
      });
      this.map.addControl(this._mousePositionControl);
    };

    /**
     * Adds label div to each map when data is split
     *
     * @method addTitle
     * @param mapLabel {String}
     * @return {undefined}
     */
    TileMapMap.prototype.addTitle = function (mapLabel) {
      if (this._label) return;

      var label = this._label = L.control();

      label.onAdd = function () {
        this._div = L.DomUtil.create('div', 'tilemap-info tilemap-label');
        this.update();
        return this._div;
      };
      label.update = function () {
        this._div.innerHTML = '<h2>' + _.escape(mapLabel) + '</h2>';
      };

      // label.addTo(this.map);
      this.map.addControl(label);
    };

    /**
     * remove css class for desat filters on map tiles
     *
     * @method saturateTiles
     * @return undefined
     */
    TileMapMap.prototype.saturateTiles = function (isDesaturated) {
      if (isDesaturated) {
        $(this._tileLayer.getContainer()).removeClass('no-filter');
      } else {
        $(this._tileLayer.getContainer()).addClass('no-filter');
      }
    };

    TileMapMap.prototype.updateSize = function () {
      this.map.invalidateSize({
        debounceMoveend: true
      });
    };

    TileMapMap.prototype.destroy = function () {
      if (this._label) this._label.removeFrom(this.map);
      if (this._fitControl) this._fitControl.removeFrom(this.map);
      if (this._drawControl) this._drawControl.removeFrom(this.map);
      if (this._markers) this._markers.destroy();
      syncMaps.remove(this.map);
      this.map.remove();
      this.map = undefined;
    };

    TileMapMap.prototype.clearPOILayers = function () {
      const self = this;
      Object.keys(this._poiLayers).forEach(function (key) {
        const layer = self._poiLayers[key];
        self._layerControl.removeLayer(layer);
        self.map.removeLayer(layer);
      });
      this._poiLayers = {};
      if (this._toolbench) this._toolbench.removeTools();
    };

    TileMapMap.prototype.addPOILayer = function (layerName, layer) {
      //remove layer if it already exists
      if (_.has(this._poiLayers, layerName)) {
        const layer = this._poiLayers[layerName];
        this._layerControl.removeLayer(layer);
        this.map.removeLayer(layer);
        delete this._poiLayers[layerName];
      }

      this.map.addLayer(layer);
      this._layerControl.addOverlay(layer, layerName);
      this._poiLayers[layerName] = layer;

      //Add tool to l.draw.toolbar so users can filter by POIs
      if (Object.keys(this._poiLayers).length === 1) {
        if (this._toolbench) this._toolbench.removeTools();;
        if (!this._toolbench) this._addDrawControl();
        this._toolbench.addTool();
      }
    };

    /**
     * Switch type of data overlay for map:
     * creates featurelayer from mapData (geoJson)
     *
     * @method _addMarkers
     */
    TileMapMap.prototype.addMarkers = function (chartData, newParams, tooltipFormatter, valueFormatter, collar) {
      this._setMarkerType(newParams.mapType);
      this._setAttr(newParams);
      this._chartData = chartData;
      this._geoJson = _.get(chartData, 'geoJson');
      this._collar = collar;

      let visible = true;
      if (this._markers) {
        visible = this._markers.isVisible();
        this._markers.destroy();
      }

      this._markers = this._createMarkers({
        tooltipFormatter: tooltipFormatter,
        valueFormatter: valueFormatter,
        visible: visible,
        attr: this._attr
      });

      if (this._geoJson.features.length > 1) {
        this._markers.addLegend();
      }
    };

    /**
     * Display geospatial filters as map layer to provide 
     * users context for all applied filters
     */
    TileMapMap.prototype.addFilters = function (filters) {
      let isVisible = false;
      if (this._filters) {
        if (this.map.hasLayer(this._filters)) {
          isVisible = true;
        }
        this._layerControl.removeLayer(this._filters);
        this.map.removeLayer(this._filters);
      }

      const style = {
        fillColor: "#ccc",
        color: "#ccc",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.75
      }
      this._filters = L.featureGroup(filters);
      this._filters.setStyle(style);
      if (isVisible) this.map.addLayer(this._filters);
      this._layerControl.addOverlay(this._filters, "Applied Filters");
    };

    TileMapMap.prototype.clearWMSOverlays = function () {
      const self = this;
      this._wmsOverlays.forEach(function (layer) {
        self._layerControl.removeLayer(layer);
        self.map.removeLayer(layer);
      });
      this._wmsOverlays = [];
    };

    TileMapMap.prototype.addWmsOverlay = function (url, name, options) {
      const overlay = L.tileLayer.wms(url, options);
      this.map.addLayer(overlay);
      this._layerControl.addOverlay(overlay, name);
      this._wmsOverlays.push(overlay);
      $(overlay.getContainer()).addClass('no-filter');
    };
    //added sah
    TileMapMap.prototype.setBasemap = function (name) {
      //Use ESRI street layer
      //if is hasn't changed, return
      if (typeof (esriBasemap) == "undefined" || esriBasemap == name) return;
      //save basemap name
      esriBasemap = name;
      //remove if exists
      if (this._tileLayer) {
        this.map.removeLayer(this._tileLayer);
      }
      //create new basemap layer
      this._tileLayer = L.esri.basemapLayer(name); //Topographic");

      this.map.addLayer(this._tileLayer);
      //add labels?
      /*
      if (basemap === 'ShadedRelief'
        || basemap === 'Oceans'
        || basemap === 'Gray'
        || basemap === 'DarkGray'
        || basemap === 'Imagery'
        || basemap === 'Terrain'
      ) {
      layerLabels = L.esri.basemapLayer(basemap + 'Labels');
       map.addLayer(layerLabels);      
      }
      */
    };
    //added sah save the buffer distance specified in gui
    //TileMapMap.prototype.setBufferDistance = function (dist) {
    //  this.map.bufferDistance=dist;
    //};
    //added sah to save timefilter
    TileMapMap.prototype.setTimeRange = function (timerange) {
      this.map.timeRange = timerange;
    };
    //added sah to save popupfields
    TileMapMap.prototype.setPopupFields = function (fields) {
      this.map.popupFields = fields;
    };
    //added sah to save filters
    TileMapMap.prototype.setFilters = function (filters) {
      this.map.esFilters = filters;
    };
    //added sah to save filters
    TileMapMap.prototype.getFilters = function () {
      return this._filters;
    };
    //added sah to save zoom to features
    TileMapMap.prototype.setZoomToFeatures = function (flag) {
      this.map.zoomToFeatures = flag;
    };


    TileMapMap.prototype.mapBounds = function () {
      let bounds = this.map.getBounds();

      //When map is not visible, there is no width or height. 
      //Need to manually create bounds based on container width/height
      if (bounds.getNorthWest().equals(bounds.getSouthEast())) {
        let parent = this._container.parentNode;
        while (parent.clientWidth === 0 && parent.clientHeight === 0) {
          parent = parent.parentNode;
        }

        const southWest = this.map.layerPointToLatLng(L.point(parent.clientWidth / 2 * -1, parent.clientHeight / 2 * -1));
        const northEast = this.map.layerPointToLatLng(L.point(parent.clientWidth / 2, parent.clientHeight / 2));
        bounds = L.latLngBounds(southWest, northEast);
      }
      return bounds;
    };

    TileMapMap.prototype.mapZoom = function () {
      return this.map.getZoom();
    };

    /**
     * Create the marker instance using the given options
     *
     * @method _createMarkers
     * @param options {Object} options to give to marker class
     * @return {Object} marker layer
     */
    TileMapMap.prototype._createMarkers = function (options) {
      var MarkerType = markerTypes[this._markerType];
      return new MarkerType(this.map, this._geoJson, this._layerControl, options);
    };

    TileMapMap.prototype._setMarkerType = function (markerType) {
      this._markerType = markerTypes[markerType] ? markerType : defaultMarkerType;
    };

    TileMapMap.prototype._setAttr = function (attr) {
      this._attr = attr || {};

      //Ensure plugin is backwards compatible with old saved state values
      if ('static' === this._attr.scaleType) {
        this._attr.scaleType = 'Static';
      } else if ('dynamic' === this._attr.scaleType) {
        this._attr.scaleType = 'Dynamic - Linear';
      }

      //update map options based on new attributes
      if (this.map) {
        if (this._attr.scrollWheelZoom) {
          this.map.scrollWheelZoom.enable();
        } else {
          this.map.scrollWheelZoom.disable();
        }
      }
    };
    /*
    //https://gis.stackexchange.com/questions/54454/disable-leaflet-interaction-temporary
    map.dragging.disable();
map.touchZoom.disable();
map.doubleClickZoom.disable();
map.scrollWheelZoom.disable();
map.boxZoom.disable();
map.keyboard.disable();
if (map.tap) map.tap.disable();
document.getElementById('map').style.cursor='default';

turn it on again with

map.dragging.enable();
map.touchZoom.enable();
map.doubleClickZoom.enable();
map.scrollWheelZoom.enable();
map.boxZoom.enable();
map.keyboard.enable();
if (map.tap) map.tap.enable();
document.getElementById('map').style.cursor='grab';
*/
    /*
    ng-click="$emit('customEvent')"
    Then in your controller you can use
    $rootScope.$on('customEvent', function(){
        // do something
    })
    or
    $rootScope.$broadcast('buttonPressedEvent');
    And receive it like this:
    $rootScope.$on('buttonPressedEvent', function () {
                 //do stuff
            })
    */
    //added sah to enable all map events
    /*    
        TileMapMap.prototype._enableEvents = function () {
          this.map._handlers.forEach(function (handler) {
            handler.enable();
          });
          this.map.dragging.enable();
          this.map.touchZoom.enable();
          this.map.doubleClickZoom.enable();
          this.map.scrollWheelZoom.enable();
          this.map.boxZoom.enable();
          this.map.keyboard.enable();
          if (this.map.tap) this.map.tap.enable();
    
        }
        //added sah to disable all map events
        TileMapMap.prototype._disableEvents = function () {
          this.map._handlers.forEach(function (handler) {
            handler.disable();
          });
          this.map.dragging.disable();
          this.map.touchZoom.disable();
          this.map.doubleClickZoom.disable();
          this.map.scrollWheelZoom.disable();
          this.map.boxZoom.disable();
          this.map.keyboard.disable();
          if (this.map.tap) this.map.tap.disable();
    
        }
    */
    TileMapMap.prototype._attachEvents = function () {
      var self = this;

      this.map.on('moveend', _.debounce(function setZoomCenter(ev) {
        if (!self.map) return;
        if (self._hasSameLocation()) return;
        //added sah to skip refresh during map animation
        if (self._skipZoomend || self._skipMoveend) {
          self._skipMoveend = false;
          //return;
        }

        // update internal center and zoom references
        self._mapCenter = self.map.getCenter();
        self._mapZoom = self.map.getZoom();

        self._callbacks.mapMoveEnd({
          chart: self._chartData,
          collar: self._collar,
          mapBounds: self.mapBounds(),
          map: self.map,
          center: self._mapCenter,
          zoom: self._mapZoom,
        });
      }, 150, false));

      //added sah
      this.map.on('setfilter:mouseClick', function (e) {
        var bounds = _.get(e, 'bounds')
        //need to remove all the geo filters
        var isVisible=false;
        if (self._filters) {
          if (self.map.hasLayer(self._filters)) {
            isVisible = true;
          }
          self._layerControl.removeLayer(self._filters);
          self.map.removeLayer(self._filters);
        }
        self._callbacks.rectangle({
          e: e,
          chart: self._chartData,
          params: self._attr,
          bounds: bounds
        });
        //bounds: utils.scaleBounds(e.layer.getBounds(), 1)
      });

      this.map.on('setfilter:id', function (e) {
        var id = _.get(e, 'id')
        self._callbacks.id({
          e: e,
          chart: self._chartData,
          params: self._attr,
          id: id
        });
        //bounds: utils.scaleBounds(e.layer.getBounds(), 1)
      });


      this.map.on('setview:fitBounds', function (e) {
        self._fitBounds();
      });

      this.map.on('toolbench:poiFilter', function (e) {
        const poiLayers = [];
        Object.keys(self._poiLayers).forEach(function (key) {
          poiLayers.push(self._poiLayers[key]);
        });
        self._callbacks.poiFilter({
          chart: self._chartData,
          poiLayers: poiLayers,
          radius: _.get(e, 'radius', 10)
        });
      });

      this.map.on('draw:created', function (e) {
        switch (e.layerType) {
          case "marker":
            self._drawnItems.addLayer(e.layer);
            self._callbacks.createMarker({
              e: e,
              chart: self._chartData,
              latlng: e.layer._latlng
            });
            break;
          case "polygon":
            const points = [];
            e.layer._latlngs.forEach(function (latlng) {
              const lat = L.Util.formatNum(latlng.lat, 5);
              const lon = L.Util.formatNum(latlng.lng, 5);
              points.push([lon, lat]);
            });
            self._callbacks.polygon({
              chart: self._chartData,
              params: self._attr,
              points: points
            });
            break;
          case "rectangle":
            self._callbacks.rectangle({
              e: e,
              chart: self._chartData,
              params: self._attr,
              bounds: utils.scaleBounds(e.layer.getBounds(), 1)
            });
            break;
          default:
            console.log("draw:created, unexpected layerType: " + e.layerType);
        }
      });

      this.map.on('draw:deleted', function (e) {
        self._callbacks.deleteMarkers({
          chart: self._chartData,
          deletedLayers: e.layers,
        });
      });

      this.map.on('zoomend', _.debounce(function () {
        if (!self.map) return;
        if (self._hasSameLocation()) return;
        if (!self._callbacks) return;
        //added sah to skip refresh during map animation
        if (self._skipZoomend || self._skipMoveend) {
          self._skipZoomend = false;
          //return;
        }

        self._callbacks.mapZoomEnd({
          chart: self._chartData,
          map: self.map,
          zoom: self.map.getZoom(),
        });
      }, 150, false));

      this.map.on('overlayadd', function (e) {
        if (self._markers && e.name === "Aggregation") {
          self._markers.show();
        }
      });

      this.map.on('overlayremove', function (e) {
        if (self._markers && e.name === "Aggregation") {
          self._markers.hide();
        }
      });
    };

    TileMapMap.prototype._hasSameLocation = function () {
      const oldLat = this._mapCenter.lat.toFixed(5);
      const oldLon = this._mapCenter.lng.toFixed(5);
      const newLat = this.map.getCenter().lat.toFixed(5);
      const newLon = this.map.getCenter().lng.toFixed(5);
      let isSame = false;
      if (oldLat === newLat
        && oldLon === newLon
        && this.map.getZoom() === this._mapZoom) {
        isSame = true;
      }
      return isSame;
    }

    TileMapMap.prototype._createMap = function (mapOptions) {
      if (this.map) this.destroy();

      //use ESRI map.  added sah
      // add map tiles layer, using the mapTiles object settings
      if (this._attr.wms && this._attr.wms.enabled) {
        this._tileLayer = L.tileLayer.wms(this._attr.wms.url, this._attr.wms.options);
      } else {
        //this._tileLayer = L.tileLayer(mapTiles.url, mapTiles.options);
        //sah
        //Use ESRI street layer
        this._tileLayer = L.esri.basemapLayer(mapOptions.esriBasemap);
      }

      // append tile layers, center and zoom to the map options
      mapOptions.layers = this._tileLayer;
      mapOptions.center = this._mapCenter;
      mapOptions.zoom = this._mapZoom;

      this.map = L.map(this._container, mapOptions);
      // Don't show the 'Powered by Leaflet' text.
      this.map.attributionControl.setPrefix('');

      this._layerControl = L.control.layers();
      this._layerControl.addTo(this.map);

      this._addSetViewControl();
      this._addDrawControl();
      this._addMousePositionControl();
      L.control.measureScale().addTo(this.map);
      this._attachEvents();
      syncMaps.add(this.map);
    };

    /**
     * zoom map to fit all features in featureLayer
     *
     * @method _fitBounds
     * @param map {Leaflet Object}
     * @return {boolean}
     */
    TileMapMap.prototype._fitBounds = function () {
      var bounds = this._getDataRectangles();
      if (bounds.length > 0) {
        this.map.fitBounds(bounds);
      }
    };

    /**
     * Get the Rectangles representing the geohash grid
     *
     * @return {LatLngRectangles[]}
     */
    TileMapMap.prototype._getDataRectangles = function () {
      if (!this._geoJson) return [];
      return _.pluck(this._geoJson.features, 'properties.rectangle');
    };
    //added sah
    TileMapMap.prototype._fitCoordsX = function (lng) {
      if (lng < -180) lng = -180;
      if (lng > 180) lng = 180;
      return lng;
    };
    //added sah
    TileMapMap.prototype._fitCoordsY = function (lat) {
      if (lat > 90) lat = 90;
      if (lat < -90) lat = -90;
      return lat;
    };


    return TileMapMap;
  };
});
