queue()
  .defer(d3.json, "/donorschoose/projects")
  .defer(d3.json, "static/geojson/us-states.json")
  .await(makeGraphs);

  function makeGraphs(error, projectsJson, statesJson) {

    //Clean projectsJson data
    var donorschooseProjects = projectsJson;
    var dateFormat = d3.time.format("%Y-%m-%d %H:%M:%S");
    donorschooseProjects.forEach(function(d) {
      d["date_posted"] = dateFormat.parse(d["date_posted"]);
      d["date_posted"].setDate(1);
      d["total_donations"] = +d["total_donations"];
    });

    //Create a Crossfilter instance
    var ndx = crossfilter(donorschooseProjects);

    //Define Dimensions
    var dateDim = ndx.dimension(function(d) { return d["date_posted"]; });
    var resourceTypeDim = ndx.dimension(function(d) { return d["resource_type"]; });
    var povertyLevelDim = ndx.dimension(function(d) { return d["poverty_level"]; });
    var stateDim = ndx.dimension(function(d) { return d["school_state"]; });
    var totalDonationsDim  = ndx.dimension(function(d) { return d["total_donations"]; });
    var fundingStatusDim = ndx.dimension(function(d) { return d["funding_status"]; });
    var gradeLevelDim = ndx.dimension(function(d) { return d["grade_level"]; });
    var latLongDim = ndx.dimension(function (d) { 
      return {
        school_latitude: d["school_latitude"],
        school_longitude: d["school_longitude"]
      };
    });


    //Calculate metrics
    var numProjectsByDate = dateDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var numProjectsByResourceType = resourceTypeDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var numProjectsByPovertyLevel = povertyLevelDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var numProjectsByFundingStatus = fundingStatusDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var numProjectsByGradeLevel = gradeLevelDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var totalDonationsByState = stateDim.group().reduceSum(function(d) {
      return d["total_donations"];
    });
    var stateGroup = stateDim.group();
    var latLongGroup = latLongDim.group();

    var all = ndx.groupAll();
    var totalDonations = ndx.groupAll().reduceSum(function(d) {return d["total_donations"];});

    var max_state = totalDonationsByState.top(1)[0].value;

    //Define values (to be used in charts)
    var minDate = dateDim.bottom(1)[0]["date_posted"];
    var maxDate = dateDim.top(1)[0]["date_posted"];

    //Charts
    var timeChart = dc.barChart("#time-chart");
    var resourceTypeChart = dc.rowChart("#resource-type-row-chart");
    var povertyLevelChart = dc.rowChart("#poverty-level-row-chart");
    var usChart = dc.geoChoroplethChart("#uss-chart");
    var numberProjectsND = dc.numberDisplay("#number-projects-nd");
    var totalDonationsND = dc.numberDisplay("#total-donations-nd");
    var fundingStatusChart = dc.pieChart("#funding-status-chart");
    var gradeLevelChart = dc.rowChart("#grade-level-chart");
    var stateDonationsChart = dc.barChart("#state-donations-chart");

    numberProjectsND
      .formatNumber(d3.format("d"))
      .valueAccessor(function(d){return d; })
      .group(all);

    totalDonationsND
      .formatNumber(d3.format("d"))
      .valueAccessor(function(d){return d; })
      .group(totalDonations)
      .formatNumber(d3.format(".3s"));

    timeChart.width(600)
      .height(160)
      .margins({top: 10, right: 50, bottom: 30, left: 50})
      .dimension(dateDim)
      .group(numProjectsByDate)
      .transitionDuration(500)
      .x(d3.time.scale().domain([minDate, maxDate]))
      .elasticY(true)
      .xAxisLabel("Year")
      .yAxis().ticks(4);

    resourceTypeChart
      .width(300)
      .height(250)
      .dimension(resourceTypeDim)
      .group(numProjectsByResourceType)
      .on("filtered", function(chart) { renderPoints(resourceTypeDim.top(Infinity)); })
      .xAxis().ticks(4);

    povertyLevelChart
      .width(300)
      .height(250)
      .dimension(povertyLevelDim)
      .on("filtered", function(chart) { renderPoints(povertyLevelDim.top(Infinity)); })
      .group(numProjectsByPovertyLevel)
      .xAxis().ticks(4);


    usChart.width(1000)
      .height(330)
      .dimension(stateDim)
      .group(totalDonationsByState)
      .colors(["#E2F2FF", "#C4E4FF", "#9ED2FF", "#81C5FF", "#6BBAFF", "#51AEFF", "#36A2FF", "#1E96FF", "#0089FF", "#0061B5"])
      .colorDomain([0, max_state])
      .overlayGeoJson(statesJson["features"], "state", function (d) {
	return d.properties.name;
      })
    .projection(d3.geo.albersUsa()
	.scale(600)
	.translate([340, 150]))
      .title(function (p) {
	return "State: " + p["key"]
	  + "\n"
	  + "Total Donations: " + Math.round(p["value"]) + " $";
      })

    var map = new L.Map("map", {center: [37.8, -96.9], zoom: 4})
      .addLayer(new L.TileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"));
    var svg = d3.select(map.getPanes().overlayPane).append("svg"),
        g = svg.append("g").attr("class", "leaflet-zoom-hide");
    d3.json("./static/js/us-states.json", function(error, collection) {
      if (error) throw error;
      var transform = d3.geo.transform({point: projectPoint}),
      path = d3.geo.path().projection(transform);

      var feature = g.selectAll("path")
          .data(collection.features)
        .enter().append("path");

      map.on("viewreset", reset);
      reset();

      // Reposition the SVG to cover the features.
      function reset() {
        var bounds = path.bounds(collection),
            topLeft = bounds[0],
            bottomRight = bounds[1];

        svg.attr("width", bottomRight[0] - topLeft[0])
           .attr("height", bottomRight[1] - topLeft[1])
           .style("left", topLeft[0] + "px")
           .style("top", topLeft[1] + "px");

        g.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");

        feature.attr("d", path);
      }

      // Use Leaflet to implement a D3 geometric transformation.
      function projectPoint(x, y) {
        var point = map.latLngToLayerPoint(new L.LatLng(y, x));
        this.stream.point(point.x, point.y);
      }
    });
    var layerPoints = new L.LayerGroup();
    function renderPoints(points) {
      layerPoints.eachLayer(function(l) {
        map.removeLayer(l);
      });
      layerPoints.clearLayers();
      points.forEach(function(d) {
          var circle = L.circle([d.school_latitude, d.school_longitude], 1000, {
          }).addTo(map);         
          layerPoints.addLayer(circle);
      });
    }

    fundingStatusChart.height(220)
      .width(300)
      .radius(90)
      .innerRadius(40)
      .transitionDuration(1000)
      .dimension(fundingStatusDim)
      .group(numProjectsByFundingStatus)
      .on("filtered", function(chart) { renderPoints(fundingStatusDim.top(Infinity)); });

    gradeLevelChart.height(220)
      .width(300)
      .dimension(gradeLevelDim)
      .on("filtered", function(chart) { renderPoints(gradeLevelDim.top(Infinity)); })
      .group(numProjectsByGradeLevel)
      .xAxis().ticks(4);

    stateDonationsChart
      .width(1300)
      .height(220)
      .transitionDuration(1000)
      .dimension(stateDim)
      .group(totalDonationsByState)
      .on("filtered", function(chart) { renderPoints(stateDim.top(Infinity)); })
      .margins({top: 10, right: 50, bottom: 30, left: 50})
      .centerBar(false)
      .gap(5)
      .elasticY(true)
      .x(d3.scale.ordinal().domain(stateDim))
      .xUnits(dc.units.ordinal)
      .ordering(function(d){return -d.value;})
      .yAxis().tickFormat(d3.format("s"));


    dc.selectMenu('#menuselect')
      .dimension(gradeLevelDim)
      .on("filtered", function(chart) { renderPoints(gradeLevelDim.top(Infinity)); })
      .group(numProjectsByGradeLevel);
    dc.selectMenu('#menuselect-state')
     .dimension(stateDim)
      .on("filtered", function(chart) { renderPoints(stateDim.top(Infinity)); })
      .group(stateGroup);
    dc.selectMenu('#menuselect_poverty')
      .dimension(povertyLevelDim)
      .on("filtered", function(chart) { renderPoints(povertyLevelDim.top(Infinity)); })
      .group(numProjectsByPovertyLevel);

    dc.renderAll();

  };
