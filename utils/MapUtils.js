'use strict'

var _ = require('lodash')
var numeral = require('numeral')
var d3 = require('d3')

var MapUtils = {

  /**
   * Check n if is an integer
   */
  isInt(n) {
    return n % 1 === 0
  },

  /**
   * Given a value, to calculate the color value from the current indicator and confif data
   */
  getNumberColor(value, configs, meta, selected_indicator) {

    // read color from individual indicator config
    if (configs.indicators[selected_indicator].choropleth) {
      var customChoropleth = configs.indicators[selected_indicator].choropleth
      var i = 0
      while (i < customChoropleth.length) {
        if (value > customChoropleth[i].domain[0] && value < customChoropleth[i].domain[1]) {
          break
        }
        i += 1
      }
      return customChoropleth[i].color
    } else {
      var min = meta.indicators[selected_indicator].min_value
      var max = meta.indicators[selected_indicator].max_value

      var colors = configs.ui.choropleth
      var steps = configs.ui.choropleth.length
      var step = (max - min)/steps
      var colorIndex = ((value - min)/step).toFixed()

      if (colorIndex <= 0) { colorIndex = 0 }
      if (colorIndex >= steps) { colorIndex = steps - 1 }

      return colors[colorIndex]
    }
  },

  /**
   * A simple template helper function to genrerate markup from data
   */
  compileTemplate(tpl, data) {
    var re = /{{(.+?)}}/g,
      reExp = /(^( )?(var|if|for|else|switch|case|break|{|}|;))(.*)?/g,
      code = 'with(obj) { var r=[];\n',
      cursor = 0,
      result,
      match
    var add = function(line, js) {
      js? (code += line.match(reExp) ? line + '\n' : 'r.push(' + line + ');\n') :
        (code += line != '' ? 'r.push("' + line.replace(/"/g, '\\"') + '");\n' : '');
      return add;
    }
    while(match = re.exec(tpl)) {
      add(tpl.slice(cursor, match.index))(match[1], true);
      cursor = match.index + match[0].length;
    }
    add(tpl.substr(cursor, tpl.length - cursor));
    code = (code + 'return r.join(""); }').replace(/[\r\t\n]/g, '');
    try { result = new Function('obj', code).apply(data, [data]); }
    catch(err) { console.error("'" + err.message + "'", " in \n\nCode:\n", code, "\n"); }
    return result
  },

  /**
   * Normalize country name
   */
  getCountryNameId(name) {
    return name.toLowerCase().trim().replace(/\([^)]*\)/g, '').trim().replace(/ /g, '_').replace(/[^0-9a-z_]/g, '')
  },

  /**
   * Get Country Name from ISO
   */
  getCountryNameFromMetaByISO(ISO, meta) {
    return _.findKey(meta.locations, (location, key) => {
      return location['ISO'] === ISO
    })
  },

  /**
   * Get Legend Html with the selected Indicator
   */
  getLegendHTML(configs, global, selected_indicator) {

    // the gpe stuff...
    if (selected_indicator === 'map_of_the_global_partnership_for_education') {
      var labels = []

      labels.push('<li><span class="swatch fragile"></span>Fragile State</li>')
      labels.push('<li><span class="swatch" style="background:#5c6bc0"></span>Donor</li>')
      labels.push('<li><span class="swatch" style="background:#eeeeee"></span>Donee</li>')

      return `<ul class='legend-list'>${labels.join('')}</ul>`
    }

    // custom color goes first
    if(configs && configs.indicators[selected_indicator].choropleth) {
      var labels = []
      // legend for country with Data not available
      labels.push('<li><span class="swatch fragile"></span>Fragile State</li>')
      labels.push('<li><span class="swatch" style="background:#eeeeee"></span>Data not available</li>')

      var customChoropleth = configs.indicators[selected_indicator].choropleth

      customChoropleth.forEach(function(item) {
        labels.push(`<li><span class='swatch' style='background:${item.color}'></span>${item.label}</li>`)
      })

      return `<ul class='legend-list'>${labels.join('')}</ul>`
    } else {
      if (_.isNull(global.meta.indicators[selected_indicator].min_value) || _.isNull(global.meta.indicators[selected_indicator].max_value)) return

      var labels = [], from, to, color
      var min = global.meta.indicators[selected_indicator].min_value.toFixed()
      var max = global.meta.indicators[selected_indicator].max_value.toFixed()
      var colors = configs.ui.choropleth
      var steps = configs.ui.choropleth.length
      var step = ((max - min)/steps).toFixed()

      // legend for country with Data not available
      labels.push('<li><span class="swatch fragile"></span>Fragile State</li>')
      labels.push('<li><span class="swatch" style="background:#eeeeee"></span>Data not available</li>')

      for (var i = 0; i < steps; i++) {
        if (i == 0) {
          from = parseInt(min)
          to = parseInt(from) + parseInt(step)
        } else {
          from = parseInt(to)
          to = parseInt(from) + parseInt(step)
        }
        labels.push(`<li><span class='swatch' style='background:${colors[i]}'></span>${numeral(from).format('0.0a')}${' &ndash; '}${numeral(to).format('0.0a')}</li>`)
      }

      return `<ul class='legend-list'>${labels.join('')}</ul>`
    }

  },

  getFormatFromPrecision(precision) {
    var format

    if (precision == 1) {
      format = `0.0`
    } else if (precision == 2) {
      format = `0.00`
    } else if (precision == 3) {
      format = `0.000`
    } else {
      format = `0,0`
    }

    return format
  },

  /**
   * Add a tooltip
   */
  addTooltip(map, layer, popup, global, selected_indicator, configs, selected_year, e) {

    var meta = global.meta,
      indicators = global.data.locations,
      value = 'Data not available',
      countryName = MapUtils.getCountryNameFromMetaByISO(layer.feature.properties['ISO'], meta),
      latlng = e ? e.latlng : layer.getBounds().getCenter(),
      tooltipTemplate = configs.indicators[selected_indicator].tooltip,
      precision = parseInt(configs.indicators[selected_indicator].precision),
      format = MapUtils.getFormatFromPrecision(precision)

    popup.setLatLng(latlng)

    if (countryName in indicators && indicators[countryName][selected_indicator] !== undefined) {

      // gpe
      if (selected_indicator === 'map_of_the_global_partnership_for_education') {
        value = indicators[countryName][selected_indicator] == 1 ? 'Donor' : 'Donee'
      // data with years
      } else if (configs.indicators[selected_indicator].years.length) {
        value = indicators[countryName][selected_indicator].years[selected_year]

        if (!value) {
          value = 'Data not available'
        } else {
          value = indicators[countryName][selected_indicator].years[selected_year]
          value = numeral(value).format(format)
          value = MapUtils.compileTemplate(tooltipTemplate, {currentIndicator: value})
        }
      // data without years
      } else {
        if(indicators[countryName][selected_indicator]) {
          value = indicators[countryName][selected_indicator]
          if (value && !MapUtils.isInt(value)) {
            value = numeral(value).format(format)
          }
          value = MapUtils.compileTemplate(tooltipTemplate, {currentIndicator: value})
        }
      }
    }

    popup.setContent('<div class="marker-title">' + layer.feature.properties['ISO_NAME'] + '</div>' + value)

    if (!popup._map) popup.openOn(map)
    if (!L.Browser.ie && !L.Browser.opera) layer.bringToFront()
  }
}

module.exports = MapUtils
