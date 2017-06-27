define(function (require) {
  let _ = require('lodash');
  
  let angular = require('angular');
  require('ace');
  var esHost = "http://192.168.99.100:9202"

  let html = require('ui/doc_viewer/doc_viewer.html');
  require('ui/doc_viewer/doc_viewer.less');

  require('ui/modules').get('kibana')
    .directive('docViewer', function (config, Private) {
      return {
        restrict: 'E',
        template: html,
        scope: {
          hit: '=',
          indexPattern: '=',
          filter: '=?',
          columns: '=?'

        },

        link: {
          pre($scope) {
            $scope.aceLoaded = (editor) => {
              editor.$blockScrolling = Infinity;
            };
          },

          post($scope, $el, attr) {
            //added sah If a field isn't in the mapping, use this
            $scope.colors = { "moving": "red", "speed": "blue", "user_id": "green" }
            $scope.saveMessage = ""
            $scope.mode = 'table';
            $scope.mapping = $scope.indexPattern.fields.byName;
            $scope.flattened = $scope.indexPattern.flattenHit($scope.hit);
            $scope.hitJson = angular.toJson($scope.hit, true);
            $scope.formatted = $scope.indexPattern.formatHit($scope.hit);
            $scope.fields = _.keys($scope.flattened).sort();

            $scope.toggleColumn = function (fieldName) {
              _.toggleInOut($scope.columns, fieldName);
            };
            //added sah prompt to edit value, save to ES.  Note:  need to configure url to ES since the proxy doesn't work for _update
            $scope.editColumn = function (idx) {
              var fieldValue = prompt("Edit field: " + $scope.fields[idx] + " ( type: " + $scope.mapping[$scope.fields[idx]].type + " )", $scope.formatted[$scope.fields[idx]]);
              if (fieldValue != null) {
                var fieldType = $scope.mapping[$scope.fields[idx]].format.type.fieldType;
                //important - set value before replacing with number.  otherwise Angular won't update the table with the new value.
                $scope.formatted[$scope.fields[idx]] = fieldValue;
                if (fieldType == 'number') {
                  fieldValue = Number(fieldValue)
                }

                var updateObj = {
                  "script": {
                    "inline": "ctx._source." + $scope.fields[idx] + "=tag",
                    "params": {
                      "tag": fieldValue
                    }
                  }
                };
                var oldCursor = document.body.style.cursor;
                if (oldCursor === undefined) {
                  oldCursor = 'default';
                }
                document.body.style.cursor = 'progress';
                //var url = "/elasticsearch/"+$scope.formatted["_index"] +"/"+$scope.formatted["_type"] +"/"+ $scope.formatted["_id"] +"/_update";
                //why doesn't the kibana proxy work without specifying the ES url?
                var url = "/api/sense/proxy?uri=" + esHost + "/" + $scope.formatted["_index"] + "/" + $scope.formatted["_type"] + "/" + $scope.formatted["_id"] + "/_update";
                $.ajax({
                  method: "POST",
                  url: url,
                  crossDomain: true,
                  async: false,
                  data: JSON.stringify(updateObj),
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                  },
                  dataType: 'json',
                  contentType: 'application/json',
                })
                  .done(function (data) {
                    //alert("Saved")
                    $scope.saveMessage = "Saved"
                  })
                  .fail(function (e) {
                    //alert("Error updating database: " + e.message)
                    $scope.saveMessage = "Error updating data"
                  })
                  .always(function () {
                    console.log("complete");
                    document.body.style.cursor = oldCursor;
                  });
              }
            };
            /*
            Note: must use proxy due to CORS
            add this to kibana.yml and include the url to ES
             sense.proxyFilter:
                  ^https?://(192.168.99.100:9202|maps\.googleapis\.com|localhost|127\.0\.0\.1|\[::0\]).*
            */
            $scope.reverseGeocodeColumn = function (idx) {
              //var fieldValue = prompt("Edit field: " + $scope.fields[idx] + " ( type: " + $scope.mapping[$scope.fields[idx]].type+" )", $scope.formatted[$scope.fields[idx]]);
              var api = "AIzaSyCNEMoMEB1daSyHQLLbpUWzURD6RQDuIVw"
              var geocoords = $scope.formatted[$scope.fields[idx]].split(",")
              var lat = Number(geocoords[0]);
              var lng = Number(geocoords[1]);
              if (Math.abs(lat) < 0) lat *= 100;
              if (Math.abs(lng) < 0) lng *= 100;

              var url = "/api/sense/proxy?uri=" + escape("https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lng + "&sensor=false&key=" + api);
              var obj = {
                "title": "Reverse geocoding results",
                "fields": [{ "alias": "Address", "name": "formatted_address" }],
                "coords": [lat, lng],
                "loading": "Locating address closest to " + lat + ", " + lng,
                "url": url
              }
              if ($scope.$root.$$listenerCount["showPopup"] !== undefined) {
                $scope.$root.$broadcast('showPopup', obj)
              }
              else {
                var oldBodyCursor = document.body.style.cursor;
                if (oldBodyCursor === undefined) {
                  oldBodyCursor = 'default';
                }


                document.body.style.cursor = 'progress';

                $.getJSON(url)
                  .done(function (data) {
                    var streetaddress = data.results[0].formatted_address;
                    alert("Found: " + streetaddress)
                    return streetaddress;
                  })
                  .fail(function () {
                    console.log("error");
                  })
                  .always(function () {
                    console.log("complete");
                    document.body.style.cursor = oldBodyCursor;
                  });

              }
            };

            $scope.geocodeColumn = function (idx) {
              //var fieldValue = prompt("Edit field: " + $scope.fields[idx] + " ( type: " + $scope.mapping[$scope.fields[idx]].type+" )", $scope.formatted[$scope.fields[idx]]);
              var api = "AIzaSyCNEMoMEB1daSyHQLLbpUWzURD6RQDuIVw"
              var address = $scope.formatted[$scope.fields[idx]];
              var url = "/api/sense/proxy?uri=" + escape("https://maps.googleapis.com/maps/api/geocode/json?address=" + escape(address) + "&sensor=false&key=" + api);
              var obj = {
                "title": "Geocoding results",
                "fields": [
                  { "alias": "Latitude", "name": ["geometry", "location", "lat"] },
                  { "alias": "Longitude", "name": ["geometry", "location", "lng"] },
                  { "alias": "Types", "name": "types" },
                  { "alias": "Partial match", "name": "partial_match" }
                ],
                "loading": "Locating latitude and longitude for " + address,
                "address": address,
                "url": url
              }
              if ($scope.$root.$$listenerCount["showPopup"] !== undefined) {
                $scope.$root.$broadcast('showPopup', obj)
              }
              else {

                var oldBodyCursor = document.body.style.cursor;
                if (oldBodyCursor === undefined) {
                  oldBodyCursor = 'default';
                }


                document.body.style.cursor = 'progress';

                $.getJSON(url)
                  .done(function (data) {
                    //var streetaddress=data.results[0].formatted_address;
                    var coords = data.results[0].geometry.location;
                    alert("Lat: " + coords.lat + ", Lng: " + coords.lng);

                    return coords;
                  })
                  .fail(function () {
                    console.log("error");
                  })
                  .always(function () {
                    console.log("complete");
                    document.body.style.cursor = oldBodyCursor;
                  });

              }
            };

            //https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=-33.8670,151.1957&radius=500&types=food&name=cruise&key=YOUR_API_KEY
            //rankby=distance 
            //https://developers.google.com/places/web-service/search
            //api for geocoding:  AIzaSyCNEMoMEB1daSyHQLLbpUWzURD6RQDuIVw
            //https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=YOUR_API_KEY
            //http://nominatim.openstreetmap.org/reverse?format=xml&lat=52.5487429714954&lon=-1.81602098644987&zoom=18&addressdetails=1
            //http://nominatim.openstreetmap.org/reverse?format=xml&lat=52.5487429714954&lon=-1.81602098644987&zoom=18&addressdetails=1
            //http://nominatim.openstreetmap.org/search?street=9902+Jay+Lane&city=Bristow&state=VA&format=xml&polygon=1&addressdetails=1
            //http://nominatim.openstreetmap.org/search/us/brentsville/9902%20Jay%20Lane/VA?format=xml&polygon=0&addressdetails=1

            $scope.showArrayInObjectsWarning = function (row, field) {
              let value = $scope.flattened[field];
              return _.isArray(value) && typeof value[0] === 'object';
            };
          }
        }
      };
    });
});

