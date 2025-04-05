module.exports = {
  dimension: {
    value: {
      type: [plotdb.Number],
      require: true,
      desc: "該村里的數值"
    },
    village: {
      type: [plotdb.String],
      require: true,
      desc: "村里的名字，用來對應地圖區塊"
    },
    town: {
      type: [plotdb.String],
      require: true,
      desc: "鄉鎮的名字，用來對應地圖區塊"
    }
  },

  config: {
    aggregateMode: {
      name: "縣市數值",
      type: [plotdb.Choice(["加總", "平均"])],
      default: "平均",
      category: "Value"
    },
    showAll: {
      name: "顯示所有鄉鎮",
      type: [plotdb.Boolean],
      default: true,
      category: "Global Settings"
    },
    unit: {
      name: "單位",
      type: [plotdb.String],
      default: ""
    },
    colorEmpty: {
      name: "無資料顏色",
      type: [plotdb.Color],
      default: "#ccc"
    }
  },

  init: function() {
    // 🔽 這裡保留你的所有 init 程式碼（已無誤）
    var that = this, i;
    d3.select(this.root).select("defs filter#innerStroke").attr({ id: "innerStroke-" + this.id });
    d3.select(this.root).select("defs filter#shadow").attr({ id: "shadow-" + this.id });

    this.infoPanel = d3.select(this.root).append("div").style({
      position: "absolute",
      bottom: "10px",
      left: "80px",
      "min-width": "120px",
      display: "inline-block",
      float: "left",
      width: "180px",
      padding: "6px",
      "border-radius": "5px",
      background: "rgba(255,255,255,0.8)",
      "text-align": "center",
      height: "18px",
      "line-height": "18px",
      opacity: 1,
      "pointer-event": "none"
    }).text("ⓘ 點擊鄉鎮看村里");

    this.backBtn = d3.select(this.root).append("div").style({
      position: "absolute",
      bottom: "10px",
      left: "20px",
      padding: "6px",
      height: "18px",
      "border-radius": "5px",
      border: "1px solid rgba(0,0,0,0.5)",
      cursor: "pointer",
      background: "rgba(255,255,255,0.8)",
      "line-height": "18px",
      opacity: 0.2
    }).text("縮小").on("click", function(d, i) {
      that.lastActiveTown = that.activeTown;
      that.activeTown = null;
      that.render();
    });

    this.topofile = JSON.parse(utf8.decode(atob(this.assets["南投縣.json"].content)));
    this.villageNames = this.topofile.objects.village.geometries.map(function(d, i) {
      return [d.properties.C_Name, d.properties.T_Name, d.properties.V_Name];
    }).filter(function(d, i) {
      return d[2];
    });

    this.townNames = this.topofile.objects.town.geometries.map(function(d, i) {
      return [d.properties.C_Name, d.properties.T_Name];
    }).filter(function(d, i) {
      return d[1];
    });

    this.svg = d3.select(this.root).append("svg");
    this.bkrect = this.svg.append("rect").on("click", function(d, i) {
      that.lastActiveTown = that.activeTown;
      that.activeTown = null;
      that.render();
    });

    this.popup = plotd3.html.popup(this.root).on("mousemove", function(d, i, popup) {
      popup.select(".title").text([
        d.properties.C_Name,
        d.properties.T_Name || "",
        d.properties.V_Name || ""
      ].join("").trim());

      popup.select(".value").text(
          (d.properties.value == undefined ? "無數值"
              : parseInt(d.properties.value * 100) / 100) + " " + (that.config.unit || "")
      );
    });

    this.dataGroup = this.svg.append("g").attr({ class: "data-group" });
    this.legendGroup = this.svg.append("g").attr({ class: "legend-group" });

    this.counties = [];
    this.features = {
      village: topojson.feature(this.topofile, this.topofile.objects.village).features,
      town: topojson.feature(this.topofile, this.topofile.objects.town).features,
      county: topojson.feature(this.topofile, this.topofile.objects.county).features
    };
    this.features.all = this.features.town.concat(this.features.village);
    this.map = { town: {}, village: {} };

    for (var i = 0, v, t; i < this.features.village.length; i++) {
      v = this.features.village[i].properties.V_Name;
      t = this.features.village[i].properties.T_Name;
      if (!this.map.village[t]) this.map.village[t] = {};
      this.map.village[t][v] = this.features.village[i];
    }

    for (i = 0, t; i < this.features.town.length; i++) {
      t = this.features.town[i].properties.T_Name;
      this.map.town[t] = this.features.town[i];
    }
  },

  parse: function() {
    var that = this;
    this.sampleField = null;

    if (!this.dimension.value.fields.length &&
        !this.dimension.village.fields.length &&
        !this.dimension.town.fields.length) {
      this.data = this.villageNames.map(function(d, i) {
        return {
          value: Math.round(Math.random() * 100) + 1,
          town: d[1],
          village: d[2]
        };
      });

      this.sampleField = [{
        datatype: "Number",
        name: "Value",
        data: this.data.map(function(d, i) { return d.value; })
      }];
    } else if (!this.dimension.value.fields.length) {
      this.data.map(function(d, i) { d.value = 0; });
    }

    var cvalue = {};
    this.data.map(function(d, i) {
      d.town = d.town.trim();
      d.village = d.village.trim();
      d.feature = that.map.village[d.town][d.village];
      if (d.feature) d.feature.properties.value = d.value;

      if (!cvalue[d.town]) {
        cvalue[d.town] = { value: d.value, count: 1 };
      } else {
        cvalue[d.town].value += d.value;
        cvalue[d.town].count += 1;
      }
    });

    for (var k in cvalue) {
      if (this.config.aggregateMode == "平均") {
        cvalue[k].value /= (cvalue[k].count || 1);
      }
      if (cvalue[k].value) that.map.town[k].properties.value = cvalue[k].value;
    }

    this.data = this.data.filter(function(d, i) { return d.feature; });
    this.valueRange = d3.extent(this.data.map(function(d, i) { return d.value; }));
    if (this.valueRange[0] == this.valueRange[1]) this.valueRange[1]++;
  },

  bind: function() {
    var that = this, sel;
    sel = this.dataGroup.selectAll("g.villages").data(this.townNames);
    sel.exit().remove();
    sel.enter().append("g").attr({ class: "villages" });

    this.dataGroup.selectAll("g.villages").each(function(d, i) {
      var sel, node = d3.select(this);
      sel = node.selectAll("path.data.geoblock.village")
          .data(that.features.village.filter(function(e, j) {
            return e.properties.T_Name == d[1];
          }));

      sel.exit().remove();
      sel.enter().append("path").attr({ class: "geoblock" });
    });

    sel = this.dataGroup.selectAll("path.data.geoblock.town").data(this.features.town);
    sel.exit().remove();
    sel = sel.enter().append("path").attr({ class: "geoblock" });

    sel = this.dataGroup.selectAll("path.geoblock");
    sel.attr({
      class: function(d, i) {
        return "data geoblock " + (d.properties.V_Name ? "village" : "town");
      }
    }).filter(function(d, i) {
      return d3.select(this).classed("town");
    }).on("click", function(d, i) {
      if (that.smallScreen)
        that.infoPanel.text("ⓘ 點擊村里看數值");
      else
        that.infoPanel.transition("fadeout").duration(500).style({ opacity: 0 });

      that.lastActiveTown = that.activeTown;
      that.activeTown = that.activeTown == d ? null : d;
      that.render();
    });

    sel.filter(function(d, i) {
      return d3.select(this).classed("village");
    }).on("click", function(d, i) {
      that.infoPanel.text(
          d.properties.C_Name + d.properties.T_Name + " : " + d.properties.value + " " + (that.config.unit || "")
      );

      that.lastActiveVillage = that.activeVillage;
      that.activeVillage = d3.select(this);
      that.activeVillage.style({ filter: "url(#innerStroke-" + that.id + ")" });

      if (that.lastActiveVillage)
        that.lastActiveVillage.style({ filter: "none" });

      if (false) {
        var ret = (that.config.showAll ? that.map.town[d.properties.T_Name] : null);
        that.lastActiveTown = that.activeTown;
        that.activeTown = that.activeTown == ret ? null : ret;
        that.render();
      }
    });

    if (!this.smallScreen && this.config.popupShow)
      this.popup.nodes(sel);
  }
};
