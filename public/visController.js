/*
 * Had to rework original tilemap functionallity to migrate 
 * to TemplateVisType. Combined pieces from 
 *   plugins/kbn_vislib_vis_types/public/tileMap.js
 *   ui/public/vislib/visualizations/tile_map.js
 */
import d3 from 'd3';
import _ from 'lodash';
import $ from 'jquery';
import AggResponseGeoJsonGeoJsonProvider from 'ui/agg_response/geo_json/geo_json';
import MapProvider from 'plugins/enhanced_tilemap/vislib/_map';
//added sah to get current filters
//import FilterBarQueryFilterProvider from 'ui/filter_bar/query_filter';

define(function (require) {
  var module = require('ui/modules').get('kibana/enhanced_tilemap', ['kibana']);

  module.controller('KbnEnhancedTilemapVisController', function ($scope, $rootScope, timefilter, $element, Private, courier, config, getAppState) {
    let aggResponse = Private(require('ui/agg_response/index'));

    const queryFilter = Private(require('ui/filter_bar/query_filter'));
    const callbacks = Private(require('plugins/enhanced_tilemap/callbacks'));
    const geoFilter = Private(require('plugins/enhanced_tilemap/vislib/geoFilter'));
    const POIsProvider = Private(require('plugins/enhanced_tilemap/POIs'));
    const utils = require('plugins/enhanced_tilemap/utils');
    let TileMapMap = Private(MapProvider);
    const geoJsonConverter = Private(AggResponseGeoJsonGeoJsonProvider);
    const Binder = require('ui/Binder');
    const ResizeChecker = Private(require('ui/vislib/lib/resize_checker'));
    let map = null;
    let collar = null;

    appendMap();
    modifyToDsl();

    const shapeFields = $scope.vis.indexPattern.fields.filter(function (field) {
      return field.type === 'geo_shape';
    }).map(function (field) {
      return field.name;
    });
    //Using $root as mechanism to pass data to vis-editor-vis-options scope
    $scope.$root.etm = {
      shapeFields: shapeFields
    };

    const binder = new Binder();
    const resizeChecker = new ResizeChecker($element);
    binder.on(resizeChecker, 'resize', function () {
      resizeArea();
    });

    function modifyToDsl() {
      $scope.vis.aggs.origToDsl = $scope.vis.aggs.toDsl;
      $scope.vis.aggs.toDsl = function () {
        resizeArea();
        const dsl = $scope.vis.aggs.origToDsl();

        //append map collar filter to geohash_grid aggregation
        _.keys(dsl).forEach(function (key) {
          if (_.has(dsl[key], "geohash_grid")) {
            const origAgg = dsl[key];
            origAgg.geohash_grid.precision = utils.getPrecision(map.mapZoom(), config.get('visualization:tileMap:maxPrecision'));
            dsl[key] = {
              filter: aggFilter(origAgg.geohash_grid.field),
              aggs: {
                filtered_geohash: origAgg
              }
            }
          }
        });
        return dsl;
      }
    }

    function aggFilter(field) {
      collar = utils.scaleBounds(
        map.mapBounds(),
        $scope.vis.params.collarScale);
      var filter = { geo_bounding_box: {} };
      filter.geo_bounding_box[field] = collar;
      return filter;
    }

    //Useful bits of ui/public/vislib_vis_type/buildChartData.js
    function buildChartData(resp) {
      const aggs = resp.aggregations;
      let numGeoBuckets = 0;
      _.keys(aggs).forEach(function (key) {
        if (_.has(aggs[key], "filtered_geohash")) {
          aggs[key].buckets = aggs[key].filtered_geohash.buckets;
          delete aggs[key].filtered_geohash;
          numGeoBuckets = aggs[key].buckets.length;
        }
      });
      //console.log("geogrids: " + numGeoBuckets);
      if (numGeoBuckets === 0) return;
      var tableGroup = aggResponse.tabify($scope.vis, resp, {
        canSplit: true,
        asAggConfigResults: true
      });
      var tables = tableGroup.tables;
      var firstChild = tables[0];
      return geoJsonConverter($scope.vis, firstChild);
    }

    function getGeoExtents(visData) {
      return {
        min: visData.geoJson.properties.min,
        max: visData.geoJson.properties.max
      }
    }

    function initPOILayer(layerParams) {
      const layer = new POIsProvider(layerParams);
      const options = {
        color: _.get(layerParams, 'color', '#008800'),
        size: _.get(layerParams, 'markerSize', 'm')
      };
      layer.getLayer(options, function (layer) {
        map.addPOILayer(layerParams.savedSearchId, layer);
      });
    }

    $scope.$watch('vis.params', function (visParams) {
      map.saturateTiles(visParams.isDesaturated);
      map.clearPOILayers();
      //added sah to set the ESRI basemap
      map.setBasemap(visParams.esriService);
      //added sah to set the user defined buffer distance for mouse clicks on markers
      //map.setBufferDistance(visParams.buffer);
      //added sah to set the list of fields to retrieve and display in the popup window
      map.setPopupFields(visParams.popupFields);
      //added sah to set the list of fields to retrieve and display in the popup window
      //map.setZoomToFeatures(visParams.zoomToFeatures);
      //map.zoomToFeatures=visParams.zoomToFeatures;

      $scope.vis.params.overlays.savedSearches.forEach(function (layerParams) {
        initPOILayer(layerParams);
      });
    });
    /*
    $rootScope.$on('timeAnimationStart', function () {
        map.zoomToFeatures=true;
             //do stuff
    })      
    $rootScope.$on('timeAnimationStop', function () {
         //do stuff
        map.zoomToFeatures=false;
    })
*/
    $rootScope.$on('autoPanDuringAnimation', function () {
      map.zoomToFeatures = !map.zoomToFeatures;
      //do stuff
    })

    //added sah intercept animated queries to find the min bbox of results, set as extent, then run again to get the hits
    $rootScope.$on('getQueryMapExtent', function (event, data) {
      //map.zoomToFeatures = !map.zoomToFeatures;
      //       scope.$on('timesliderSelect', function (event,data) {
      //   select(data.nextStart, data.nextStop);
      // });
      var snappedExtent = data;
      //set filter for timestamp
      var filters = queryFilter.getFilters(); // returns array of **pinned** filters
      var from = new Date(data.nextStart).getTime();
      var to = new Date(data.nextStop).getTime();
      var must = []
      var extent = map.map.getBounds();
      var hasGeoFilter = false;
      if(map.map.esFilters){
      for(var i in map.map.esFilters)
      {
          if(map.map.esFilters[i].geo_bounding_box){
            hasGeoFilter=true;
            break;
          }
      }
      }
      //OBS!  Use full extent for all searches, unless a geo filter is specified

      if (extent && !hasGeoFilter) {
          var bbox = {
            "geo_bounding_box": {
              "geocoordinates": {
                "top_left": {
                  "lat": 90,
                  "lon": -180
                },
                "bottom_right": {
                  "lat": -90,
                  "lon": 180
                }
              }
            }
          }
          must.push(bbox);
        
        /*
        if (extent._northEast.lat === extent._southWest.lat && map.lastExtent) {
          must.push(map.lastExtent)
        }
        else {
          var bbox = {
            "geo_bounding_box": {
              "geocoordinates": {
                "top_left": {
                  "lat": map._fitCoordsY(extent._northEast.lat),
                  "lon": map._fitCoordsX(extent._southWest.lng)
                },
                "bottom_right": {
                  "lat": map._fitCoordsY(extent._southWest.lat),
                  "lon": map._fitCoordsX(extent._northEast.lng)
                }
              }
            }
          }
          must.push(bbox);
          map.lastExtent = bbox;
        }
        */
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
        "size": 0,
        "query":
        {
          "filtered":
          {
            "query": {
              "exists": { "field": "geocoordinates" }
            },
            "filter":
            {
              "bool":
              {
                "must": must
              }
            }
          }
        },
        "aggs": {
          "map_zoom": {
            "geo_bounds": {
              "field": "geocoordinates"
            }
          }
        }
      };
      var url = "/elasticsearch/locations/_search?timeout=0&ignore_unavailable=true";

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
          //set current map extent
          try {
            map.map.fitBounds(
              L.latLngBounds([
                [
                  data.aggregations.map_zoom.bounds.top_left.lat,
                  data.aggregations.map_zoom.bounds.top_left.lon
                ],
                [
                  data.aggregations.map_zoom.bounds.bottom_right.lat,
                  data.aggregations.map_zoom.bounds.bottom_right.lon
                ]
              ])
            )
          } catch (e) {
          }
        })
        .fail(function (data) {
          console.log(data);
        })
        .always(function () {
          $rootScope.$broadcast('timesliderSelect', data);
        });
      //do stuff
    })

    /*
    $scope.findNearby=function(lat,lng){
alert("ok")
    }
    */
    //$scope.$broadcast('event', { a: item1, b: item2 })
    //Then access them from the second argument to the callback:
    $scope.$on('showPopup', function (event, opt) {
      // access opt.a, opt.b
      var oldMapCursor = map.map.getContainer().style.cursor;
      if (oldMapCursor === undefined) {
        oldMapCursor = 'default';
      }
      var oldBodyCursor = document.body.style.cursor;
      if (oldBodyCursor === undefined) {
        oldBodyCursor = 'default';
      }

      map.map.getContainer().style.cursor = 'progress'
      document.body.style.cursor = 'progress';
      var minWidth = 500
      var options = { "maxWidth": 800, "minWidth": minWidth, offset: new L.Point(0, 0) }
      var latLng = map.map.getCenter();
      if (opt.coords) latLng = L.latLng(opt.coords[0], opt.coords[1]);
      //, "closeOnClick": true, "closeButton": true, "autoPan": false, "autoClose": true
      var content = "<table><tbody><tr><td><div class='loader'></div></td><td><h4>" + opt.loading + "</h4></td></tr></tbody></table>";

      var layerPopup = L.popup(options)
        .setLatLng(latLng)
        .setContent(content)
        .openOn(map.map);

      $.getJSON(opt.url)
        .done(function (json) {
          //var streetaddress=data.results[0].formatted_address;
          var data = json.results;//[0].geometry.location;
          var content = "<h4>" + opt.title + "</h4><table width='100%'>"
          var fields = opt.fields;["name", "types"];//,"vicinity"


          for (var i in fields) {
            content += "<th>" + fields[i].alias + "</th>";
            //types" : [ "restaurant", "food", "establishment" ],         "vicinity"
          }
          //<th>AS1</th><th>IP Src</th><th>IP Dest</th>";

          for (var hit in data) {
            //content += "<tr><td><a href='#'>Edit</a></td><td title='" + data.hits.hits[hit]._id + "'>" + hit + "</td><td>" + data.hits.hits[hit]._index + "</td>";
            content += "<tr>";
            for (var i in fields) {
              var str;
              if (fields[i].name instanceof Array) {
                str = data[hit];//[fields[i]]
                for (var j in fields[i].name) {
                  str = str[fields[i].name[j]]
                  //var str = opt.data[hit][fields[i].name[0]][fields[i].name[1]];
                }
              } else {
                str = data[hit][fields[i].name];
              }

              if (str instanceof Array) str = str.join(", ");
              content += "<td>" + str + "</td>";
            }
            content += "</tr>";
            //<td>" + data.hits.hits[hit]._source.as1+ "</td><td>" + data.hits.hits[hit]._source.ipSrc + "</td><td>" + data.hits.hits[hit]._source.ipDst + "</td></tr>"
          }
          content += "</table>"

          var point = map.map.latLngToContainerPoint(latLng);
          var mapSize = map.map.getSize();
          var calcHeight = (data.length * 25) + 50;
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
          //if box overlaps top
          if (point.y < calcHeight) {
            point.y = calcHeight + buffer;
          }
          var adjLatLng = map.map.containerPointToLatLng(point);
          layerPopup.setLatLng(adjLatLng);
          //layerPopup.options.maxWidth = 600;
          //layerPopup.options.maxHeight = calcHeight;    
          //layerPopup.setContent(content);


          layerPopup.setContent(content)
          layerPopup.update();

        })
        .fail(function () {
          console.log("error");
        })
        .always(function () {
          console.log("complete");
          map.map.getContainer().style.cursor = oldMapCursor;
          document.body.style.cursor = oldBodyCursor;

        });
    });


    /*
        $scope.$on('showPopup1', function (event, opt) {
          // access opt.a, opt.b
          var oldCursor = map.map.getContainer().style.cursor;
          if (oldCursor === undefined) {
            oldCursor = 'default';
          }
          map.map.getContainer().style.cursor = 'progress'
          map.map.getContainer().style.cursor = oldCursor
          var content = "<h4>" + opt.title + "</h4><table width='100%'>"
          var fields = opt.fields;["name", "types"];//,"vicinity"
    
    
          for (var i in fields) {
            content += "<th>" + fields[i].alias + "</th>";
            //types" : [ "restaurant", "food", "establishment" ],         "vicinity"
          }
          //<th>AS1</th><th>IP Src</th><th>IP Dest</th>";
    
          for (var hit in opt.data) {
            //content += "<tr><td><a href='#'>Edit</a></td><td title='" + data.hits.hits[hit]._id + "'>" + hit + "</td><td>" + data.hits.hits[hit]._index + "</td>";
            content += "<tr>";
            for (var i in fields) {
              var str;
              if (fields[i].name instanceof Array) {
                str = opt.data[hit];//[fields[i]]
                for (var j in fields[i].name) {
                  str = str[fields[i].name[j]]
                  //var str = opt.data[hit][fields[i].name[0]][fields[i].name[1]];
                }
              } else {
                str = opt.data[hit][fields[i].name];
              }
    
              if (str instanceof Array) str = str.join(", ");
              content += "<td>" + str + "</td>";
              if (hit >= 19) break;
            }
            content += "</tr>";
            //<td>" + data.hits.hits[hit]._source.as1+ "</td><td>" + data.hits.hits[hit]._source.ipSrc + "</td><td>" + data.hits.hits[hit]._source.ipDst + "</td></tr>"
          }
          content += "</table>"
          var minWidth = 500
          var options = { "maxWidth": 800, "minWidth": minWidth, offset: new L.Point(0, 0) }
          //, "closeOnClick": true, "closeButton": true, "autoPan": false, "autoClose": true
          var latLng = map.map.getCenter();
          var point = map.map.latLngToContainerPoint(latLng);
          var mapSize = map.map.getSize();
          var calcHeight = (opt.data.length * 25) + 50;
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
          //if box overlaps top
          if (point.y < calcHeight) {
            point.y = calcHeight + buffer;
          }
          latLng = map.map.containerPointToLatLng(point);
          layerPopup = L.popup(options)
            .setLatLng(latLng)
            .setContent(content)
            .openOn(map.map);
        });
    */
    $scope.$watch('esResponse', function (resp) {
      if (resp) {
        /*
         * 'apply changes' creates new vis.aggs object
         * Modify toDsl function and refetch data.
         */
        if (!_.has($scope.vis.aggs, "origToDsl")) {
          modifyToDsl();
          courier.fetch();
          return;
        }
        //sah add timerange to map
        map.setTimeRange(timefilter.time)
        // Somewhere in your directive, service, or controller
        //const queryFilter = Private(FilterBarQueryFilterProvider);
        var filters = queryFilter.getFilters(); // returns array of **pinned** filters
        map.setFilters(filters)



        const chartData = buildChartData(resp);
        if (!chartData) {
          if (map._markers) {
            visible = map._markers.isVisible();
            map._markers.destroy();
          }

          return;
        }
        const geoMinMax = getGeoExtents(chartData);
        chartData.geoJson.properties.allmin = geoMinMax.min;
        chartData.geoJson.properties.allmax = geoMinMax.max;

        //add overlay layer to provide visibility of filtered area
        let fieldName = getGeoField();
        if (fieldName) {
          map.addFilters(geoFilter.getGeoFilters(fieldName));
        }

        drawWmsOverlays();

        map.addMarkers(
          chartData,
          $scope.vis.params,
          Private(require('ui/agg_response/geo_json/_tooltip_formatter')),
          _.get(chartData, 'valueFormatter', _.identity),
          collar);

        _.filter($scope.vis.params.overlays.savedSearches, function (layerParams) {
          return layerParams.syncFilters
        }).forEach(function (layerParams) {
          initPOILayer(layerParams);
        });

        //if (map.zoomToFeatures) {
        //need to disable map events temporarily
        //if(pointCount!=map._markers.length)
        //map._disableEvents();
        //  map._skipZoomend = true;
        //  map._skipMoveend = true;
        //var bounds = map._getDataRectangles();
        //map.map.panTo(bounds.getCenter());
        //map.map.panInsideBounds(bounds.getCenter());
        //  map._fitBounds();
        //map._enableEvents();
        //pointCount=map._markers.length;
        //}

      }
    });

    $scope.$on("$destroy", function () {
      binder.destroy();
      resizeChecker.destroy();
      if (map) map.destroy();
    });

    /**
     * Field used for Geospatial filtering can be set in multiple places
     * 1) field specified by geohash_grid aggregation
     * 2) field specified under options in event no aggregation is used
     *
     * Use this method to locate the field
     */
    function getGeoField() {
      let fieldName = null;
      if ($scope.vis.params.filterByShape && $scope.vis.params.shapeField) {
        fieldName = $scope.vis.params.shapeField;
      } else {
        const agg = utils.getAggConfig($scope.vis.aggs, 'segment');
        if (agg) {
          fieldName = agg.fieldName();
        }
      }
      return fieldName;
    }

    function drawWmsOverlays() {
      map.clearWMSOverlays();
      if ($scope.vis.params.overlays.wmsOverlays.length === 0) {
        return;
      }

      const source = new courier.SearchSource();
      const appState = getAppState();
      source.set('filter', queryFilter.getFilters());
      if (appState.query && !appState.linked) {
        source.set('query', appState.query);
      }
      source._flatten().then(function (fetchParams) {
        const esQuery = fetchParams.body.query;
        //remove kibana parts of query
        const cleanedMust = [];
        if (_.has(esQuery, 'filtered.filter.bool.must')) {
          esQuery.filtered.filter.bool.must.forEach(function (must) {
            cleanedMust.push(_.omit(must, ['$state', '$$hashKey']));
          });
        }
        esQuery.filtered.filter.bool.must = cleanedMust;
        const cleanedMustNot = [];
        if (_.has(esQuery, 'filtered.filter.bool.must_not')) {
          esQuery.filtered.filter.bool.must_not.forEach(function (mustNot) {
            cleanedMustNot.push(_.omit(mustNot, ['$state', '$$hashKey']));
          });
        }
        esQuery.filtered.filter.bool.must_not = cleanedMustNot;
        const escapedQuery = JSON.stringify(esQuery).replace(new RegExp('[,]', 'g'), '\\,');

        $scope.vis.params.overlays.wmsOverlays.forEach(function (layerParams) {
          const name = _.get(layerParams, 'displayName', layerParams.layers);
          const options = {
            format: 'image/png',
            layers: layerParams.layers,
            maxFeatures: _.get(layerParams, 'maxFeatures', 1000),
            transparent: true,
            version: '1.1.1'
          };
          if (_.get(layerParams, 'viewparams')) {
            options.viewparams = 'q:' + escapedQuery;
          }
          map.addWmsOverlay(layerParams.url, name, options);
        });
      });
    }

    function appendMap() {
      const initialMapState = utils.getMapStateFromVis($scope.vis);
      var params = $scope.vis.params;
      var container = $element[0].querySelector('.tilemap');
      map = new TileMapMap(container, {
        center: initialMapState.center,
        zoom: initialMapState.zoom,
        callbacks: callbacks,
        mapType: params.mapType,
        esriBasemap: params.esriService,
        attr: params,
        editable: $scope.vis.getEditableVis() ? true : false
      });
    }

    function resizeArea() {
      if (map) map.updateSize();
    }
  });
});
