var View = require('./view.js');
var api  = require('../api.js');
var $ = require('jquery');
var fastclick = require('fastclick');
var ouiCal = require('../ouical.js');
var async = require('async')
window.$ = $

module.exports = View.extend({

  $id : 'map-view',

  template : require('./templates/map.hbs'),

  addressPartial: require('./templates/partials/address.hbs'),

  pollingLocationPartial: require('./templates/partials/polling-location-info.hbs'),

  landscape: false,

  hasSubmitted: false,

  initialParent: undefined,

  modal: false,

  events: {
    '#map-view click' : "closePopUps",
    '.nav click' : 'back',
    '.contest-toggle click' : 'toggleContest',
    '.election-selection click' : 'changeElection',
    '#registered-address click' : 'changeAddress',
    '#vote-address-edit click' : 'changeAddress',
    '.address click' : 'changeAddress',
    '#fade click' : 'changeAddress',
    '#submit-address-button click' : 'submitAddress',
    '#polling-location click' : 'toggleMap',
    '#more-elections click' : 'toggleElections',
    '#resources-toggle click' : 'toggleResources',
    '#plus-icon click' : 'openAboutModal',
    '#close-button click' : 'closeAboutModal',
    '#ballot-information click' : 'toggleBallot',
    '#map-view-toggle click' : 'toggleMapListView',
    '#alert click' : 'closeAlert'
  },

  map: null,

  markers: [],

  address: '',

  locationTypes: {},

  timeouts: [],

  mapIsDisplayed: true,

  onBeforeRender: function(options) {
    var that = this;

    $("#_vit").css("max-width", "800px")
    $("#_vit .footer").css("max-width", "800px")

    if (navigator.userAgent.match('CriOS')) {
      $('<meta>')
        .attr('name', 'viewport')
        .attr('content', 'width=device-width,initial-scale=0.75')
        .attr('id', 'viewport-mobile-web-tag')
        .appendTo($('head'));
    }

    $(this.$container).css('-webkit-overflow-scrolling', 'touch');

    // add the early vote sites to the regular polling places
    var pollingLocations = options.data.pollingLocations;
    var earlyVoteSites = options.data.earlyVoteSites;
    var dropOffLocations = options.data.dropOffLocations;
    var earlyVoteSitesToRemove = [];
    var dropOffLocationsToRemove = [];
    this.locationTypes.hasBoth = false;

    var removeIndices = function(arr, indices) {
      for (var i = arr.length-1; i > -1; i--)
        if (indices.indexOf(i) !== -1)
          arr.splice(i, 1);
    };

    var mergeAndRemoveDups = function(pollingLocation, otherLocation, otherLocationCollection, toRemoveCollection, isBoth, isBothPollingAndDropoff) {
      if ((pollingLocation.address.line1 === otherLocation.address.line1 &&
           pollingLocation.address.line1) ||
          (pollingLocation.address.locationName === otherLocation.address.LocationName &&
           pollingLocation.address.locationName)) {
        $.extend(pollingLocation, otherLocation);

        var idx = otherLocationCollection.indexOf(otherLocation);
        toRemoveCollection.push(idx);

        if (isBoth) {
          pollingLocation.isBoth = true;
          that.locationTypes.hasBoth = true;
        } else pollingLocation.isBothEarlyVoteAndDropOff = true;

        if (isBothPollingAndDropoff)
          pollingLocation.isBothPollingAndDropOff = true;

        if (pollingLocation.isBoth && otherLocation.isDropOffLocation)
          pollingLocation.isDropOffLocation = false;
      }
    }

    if (pollingLocations) {
      var now = new Date();

      pollingLocations.forEach(function(pollingLocation) {
        if (pollingLocation.name) pollingLocation.address.name = pollingLocation.name;

        pollingLocation.isEarlyVoteSite = false
        pollingLocation.isBoth = false;
        pollingLocation.isDropOffLocation = false;
        pollingLocation.isBothEarlyVoteAndDropOff = false;
        pollingLocation.isBothPollingAndDropOff = false;

        if (earlyVoteSites) {
          earlyVoteSites.forEach(function(earlyVoteSite) {
            var endDate = new Date(earlyVoteSite.endDate);
            earlyVoteSite.isEarlyVoteSite = true;

            if (earlyVoteSite.name)
              earlyVoteSite.address.name = earlyVoteSite.name;

            if (endDate < now)
              earlyVoteSitesToRemove.push(idx);
            else
              mergeAndRemoveDups(pollingLocation, earlyVoteSite, earlyVoteSites, earlyVoteSitesToRemove, true, false);
          });
          if (dropOffLocations)
            dropOffLocations.forEach(function(dropOffLocation) {
              dropOffLocation.isDropOffLocation = true;
              mergeAndRemoveDups(pollingLocation, dropOffLocation, dropOffLocations, dropOffLocationsToRemove, false, false);
            })
        } else if (dropOffLocations)
          dropOffLocations.forEach(function(dropOffLocation) {
            dropOffLocation.isDropOffLocation = true;
            mergeAndRemoveDups(pollingLocation, dropOffLocation, dropOffLocations, dropOffLocationsToRemove, false, true);
          })
      });

      if (earlyVoteSites)
        removeIndices(earlyVoteSites, earlyVoteSitesToRemove);
      if (dropOffLocations)
        removeIndices(dropOffLocations, dropOffLocationsToRemove);
    } else {
      if (earlyVoteSites) {
        earlyVoteSites.forEach(function(earlyVoteSite) {
          var endDate = new Date(earlyVoteSite.endDate);
          earlyVoteSite.isEarlyVoteSite = true;

          if (earlyVoteSite.name)
            earlyVoteSite.address.name = earlyVoteSite.name;

          if (endDate < now)
            earlyVoteSitesToRemove.push(idx);

          if (dropOffLocations)
            dropOffLocations.forEach(function(dropOffLocation) {
              dropOffLocation.isDropOffLocation = true;
              mergeAndRemoveDups(earlyVoteSite, dropOffLocation, dropOffLocations, dropOffLocationsToRemove, false, false)
            })
        });

        removeIndices(earlyVoteSites, earlyVoteSitesToRemove);
        if (dropOffLocations)
          removeIndices(dropOffLocations, dropOffLocationsToRemove);
      }
    }

    this.locationTypes.hasPollingLocations = !!pollingLocations && !!pollingLocations.length;
    this.locationTypes.hasEarlyVoteSites = (!!earlyVoteSites && earlyVoteSites.length);
    this.locationTypes.hasDropOffLocations = (!!dropOffLocations && dropOffLocations.length)

    if (pollingLocations && earlyVoteSites)
      pollingLocations = pollingLocations.concat(earlyVoteSites);
    else if (!pollingLocations && earlyVoteSites)
      pollingLocations = earlyVoteSites;

    if (pollingLocations && dropOffLocations)
      pollingLocations = pollingLocations.concat(dropOffLocations);
    else if (!pollingLocations && dropOffLocations)
      pollingLocations = dropOffLocations.map(function(location) {
        location.isDropOffLocation = true;
        return location;
      });

    if (pollingLocations) pollingLocations.forEach(function(pollingLocation) {
      if (!pollingLocation.isEarlyVoteSite && 
          !pollingLocation.isBoth &&
          !pollingLocation.isDropOffLocation &&
          !pollingLocation.isBothEarlyVoteAndDropOff &&
          !pollingLocation.isBothPollingAndDropoff)
        pollingLocation.isOnlyPollingLocation = true;
    })

    options.data.pollingLocations = pollingLocations

    // comb the address data
    var state = (options.data.state && options.data.state.length ? options.data.state[0] : {});
    if (state.electionAdministrationBody && !state.electionAdministrationBody.name) {
      state.electionAdministrationBody.name = "Election Administration Body";
    }

    if (state.local_jurisdiction && !state.local_jurisdiction.name) {
      state.local_jurisdiction.name = "Local Jurisdiction";
    }

    if (state.electionAdministrationBody &&
        state.electionAdministrationBody.correspondenceAddress &&
        state.electionAdministrationBody.physicalAddress) {

      // delete duplicate state election administration body address
      var correspondenceAddress = this._parseAddress(
        state.electionAdministrationBody.correspondenceAddress
      );
      var physicalAddress = this._parseAddress(
        state.electionAdministrationBody.physicalAddress
      );
      if (correspondenceAddress === physicalAddress) {
        delete options.data.state[0].electionAdministrationBody.correspondenceAddress;
      }
    }

    // reformat the dates
    var date = new Date(options.data.election.electionDay);

    options.data.election.dateForCalendar = date.getMonth() + 1 + '/' + date.getDate() + '/' +  date.getFullYear();

    var newDate = date.toLocaleDateString('en-us', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // options.data.election.electionDay = newDate;

    // sort the contests by their placement on the ballot
    function contestComparator(firstContest, secondContest) {
      var firstPosition = parseInt(firstContest.ballotPlacement);
      var secondPosition = parseInt(secondContest.ballotPlacement);
      return firstPosition - secondPosition;
    }
    if (options.data.contests) {
      options.data.contests = options.data.contests.sort(contestComparator);

      // remove candidate-specific party if its a primary
      options.data.contests.forEach(function(contest) {
        if (contest.type === 'Primary' && contest.primaryParty) {
          contest.candidates.forEach(function(candidate) {
            delete candidate.party;
          })
        }
      })
    }

    this.data = options.data;

    $('<div id="_vitModal">')
      .prependTo($('html'));

    if (options.modal) {
      this.modal = true;
      this.initialParent = $("#_vit").parent();
      $("#_vit").prependTo($('html'));
    }
  },

  _resizeHandler: function () {
    if (!this.modal) {
      if (this.$container.parent().width() < this.$container.width())
        this.$container.width(this.$container.parent().width());

      if (this.$container.width() < 500) {
        // set to mobile view
        this.landscape = false;
        this.$container.css({
          'overflow-y':'scroll',
          'overflow-x':'hidden'
        })
      } else {
        this.landscape = true;
        this.$container.width(this.width);
        this.$container.height(this.height)
        if (this.$container.width() < 600) {
          this.find('.info').css({ 'font-size': '14px' });
          this.find('.election').css({ 'font-size': '16px' });
          this.find('.subsection').css({ 'font-size': '15px' });
          this.find('.right .box').css({ 'padding': '5px 15px' });
          this.find('#more-resources h1').css({ 'font-size': '16px' });
        } else {
          if (this.$container.height() < 480) {
            // $('.left-wrapper')[0].style['overflow-y'] = 'auto';
            // $('.left-wrapper')[0].style['overflow-x'] = 'hidden';
            // css({
            //   overflowY: 'auto',
            //   overflowX: 'hidden'
            // })
          }
        }
      }
      return;
    }

    var width = $(window).width()
      , height = $(window).height()
      , screenWidth = screen.availWidth
      , screenHeight = screen.availHeight;

    if (!$('#viewport-mobile-web-tag').length) {
      $('<meta>')
        .attr('name', 'viewport')
        .attr('content', 'width=device-width,initial-scale=1.0')
        .attr('id', 'viewport-mobile-web-tag')
        .appendTo($('head'));
    }

    if (screenWidth < 600) {
      this.$container.width(window.innerWidth);
      this.$container.height(window.innerHeight);
      this.landscape = false;

      // this.find('.box,#map-canvas').width(window.innerWidth);
      this.find('#map-canvas').width(window.innerWidth);
      // this.find('.box').width(window.innerWidth)

    } else {
      // tablet sizing
      this.$container
        .width(width-40);

      var containerWidth = this.$container.width();
      this.$container
        .height(containerWidth * (7/10));

      var containerHeight = this.$container.height();
      var top = (height/2) - (containerHeight/2);
      top = (top > 0 ? top : 0);

      this.$container
        .css({
          'top': top + 'px',
          'left':((width/2) - (containerWidth/2)) + 'px'
        });

      $('#_vitModal').css({
        'width': width,
        'height': height
      })

      this.landscape = true;
    }

    if (this.modal && !this.landscape) {
      this.$container
        .addClass('floating-container')
      $('html, body')
        .removeClass('max-height')
        .find('body')
          .addClass('no-scroll');
    } else if (this.modal && this.landscape) {
      this.$container
        .addClass('floating-modal-container')
      $('html, body')
        .addClass('max-height')
        .find('body')
          .removeClass('no-scroll')
    }

    $(window)
      .scrollTop(0)
      .scrollLeft(0)
  },

  onAfterRender: function(options) {

    // var errorFeedbackUrl = "https://voter-info-tool.appspot.com/feedback?electionId=" + 
    //   options.data.election.id + 
    //   "&address=" +
    //   this._parseAddress(options.data.normalizedInput);

    var errorFeedbackUrl = "https://voter-info-tool.appspot.com/feedback";  

    this.find('#error-feedback-form')
      .attr('action', errorFeedbackUrl)
      .prepend($('<input name="address" value="' + this._parseAddress(options.data.normalizedInput) + '">'))
      .prepend($('<input name="electionId" value="' + options.data.election.id + '">'));

    this.find("#error-feedback-link").on("click", function (e) {
      e.preventDefault();
      // $.ajax({
      //   type: 'POST',
      //   url: 'https://voter-info-tool.appspot.com/feedback',
      //   data: {
      //     electionId: options.data.election.id,
      //     address: this._parseAddress(options.data.normalizedInput)
      //   }
      // });
      this.find('#error-feedback-form').submit();
    }.bind(this))

    var linkGroupTitles = this.find('.election-administration-body div');
    linkGroupTitles.each(function(_, group) {
      if ($(group).find('a').length === 0) {
        $(group).hide();
        linkGroupTitles.find('h1').hide();
      }
    });
    var localJurisdictionName = this.find('#local-jurisdiction-name');
    var localJurisdictionEABName = this.find('#local-jurisdiction-eab-name');

    var contains = function(first, second) {
      return String.prototype.indexOf.call(first.text().trim(), second.text().trim()) !== -1;
    }

    var equals = function(first, second) {
      return (contains(first, second) && contains(second, first));
    }

    if (equals(localJurisdictionName, localJurisdictionEABName))
      localJurisdictionName.remove();
    else if (contains(localJurisdictionName, localJurisdictionEABName))
      localJurisdictionEABName.remove();
    else if (contains(localJurisdictionEABName, localJurisdictionName))
      localJurisdictionName.remove();

    var scrapeAddress = function(arr) {
      return Array.prototype.reduce.call(
        arr,
        function(m, n) { return m + $(n).text().trim() },
        ''
      );
    }

    // remove duplicate election administration addresses
    if (scrapeAddress(this.find('#local-jurisdiction-correspondence-address').children().children()) 
      === scrapeAddress(this.find('#local-jurisdiction-physical-address').children().children())) {
      this.find('#local-jurisdiction-correspondence-address').remove();
    }

    if (scrapeAddress(this.find('#state-election-correspondence-address').children().children()) 
      === scrapeAddress(this.find('#state-election-physical-address').children().children())) {
      this.find('#state-election-correspondence-address').remove();
    }

    // remove election administration addresses that are only state acronyms
    this.find('.election-administration-address').each(function() {
      if (scrapeAddress($(this).children().children()).length === 2) $(this).remove();
    })

    if (typeof this.data.otherElections === 'undefined') {
      this.find('#more-elections .toggle-image').hide();
    }

    var informationLinks = this.find('.information-links');
    if (!informationLinks.text().trim())
      informationLinks
        .hide()
        .prev()
          .hide();

    if (!informationLinks.children().children().is(':visible'))
        informationLinks.prev().remove().end().remove()

    var informationItems = this.find('.voter-id-info').parent();
    if (this.find('.answer').text().trim().length < 10)
      informationItems
        .prev()
          .remove()
        .end()
        .remove();

    if (options.alert)
      this.find('#alert')
        .find('#text')
          .html(options.alert)
        .end()
        .show();

    this.width = options.width;
    this.height = options.height;

    this.prevWidth = this.$container.width();
    this.prevHeight = this.$container.height();
    this.prevLeft = this.$container.css('left');
    this.prevTop = this.$container.css('top');

    $(window).on('resize.mapview', this._resizeHandler.bind(this));

    this._resizeHandler();

    setTimeout(this._resizeHandler.bind(this), 250);

    if (options.alert && this.landscape)
      this.find('#location-legend')
        .css('top', '11%');

    var that = this;
    if (options.data.pollingLocations && options.data.pollingLocations.length) {
      var primaryLocation = options.data.pollingLocations[0];
      var address = this._parseAddress(primaryLocation.address);
      var daddr = this._parseAddressWithoutName(primaryLocation.address)
      var saddr = this._parseAddressWithoutName(options.data.normalizedInput);

      this._encodeAddressAndInitializeMap(primaryLocation.address, options.data.currentLocation);

      this.find('#location a').attr('href', 'https://maps.google.com?daddr=' + daddr + '&saddr=' + saddr);

      var $locationInfo = $(this.pollingLocationPartial(primaryLocation));
      var earlyVoteTag = this.find('.early-vote-site');
      if (earlyVoteTag) earlyVoteTag.remove()
      this.find('#location').append($locationInfo);
      $locationInfo.find('a').attr('href', 'https://maps.google.com?daddr=' + daddr + '&saddr=' + saddr);
      var earlyVoteTag = this.find('.early-vote-site');
      if (earlyVoteTag.length > 1)
        earlyVoteTag.last().remove()

      var ampersands = this.find('.early-vote-site').text().match(/ &/g);
      if (ampersands && ampersands.length > 1) {
        var newLocationText = this.find('.early-vote-site').text().replace(' & ', ', ');
        this.find('.early-vote-site').text(newLocationText);
      }
      if (!this.landscape) $locationInfo.hide();

      if (options.data.pollingLocations.length) {
        var locations = options.data.pollingLocations;

        this._geocodeSequence(locations, options.data.normalizedInput);
      }

    } else this._encodeAddressAndInitializeMap();

    if (this.landscape) this._switchToLandscape(options);


    if (options.data.state && 
        options.data.state.length &&
        options.data.state[0].electionAdministrationBody)
      this.find('#info-icon').parent().attr('href', options.data.state[0].electionAdministrationBody.electionInfoUrl);

    $('html,body').scrollLeft($(this.$container).scrollLeft());
    $('html,body').scrollTop($(this.$container).scrollTop());

    var formattedAddress = "";
    if (options.data.pollingLocations) {
      for (var key in options.data.pollingLocations[0].address) {
        formattedAddress += options.data.pollingLocations[0].address[key] + " "
      }
    }

    var myCalendar = createOUICalendar({
      options: {
        notClass: 'add-to-calendar-drop-class',
        id: 'add-to-calendar-dropdown'
      },
      data: {
        title: options.data.election.name,
        start: new Date(options.data.election.dateForCalendar),
        duration: 1440,
        address: formattedAddress,
        description: options.data.election.name
      }
    });

    if (this.landscape) {
      this.find('.info.box').removeClass('expanded-pane');
      this.find('#polling-location').addClass('expanded-pane')
      this.find(':not(#polling-location) .right-arrow').removeClass('hidden');
      this.find(':not(#polling-location) .left-arrow').addClass('hidden');
      this.find('#polling-location .right-arrow').addClass('hidden');
      this.find('#polling-location .left-arrow').removeClass('hidden');
      this.find('#more-resources, .contests').hide();
    }

    document.querySelector('#calendar-icon').appendChild(myCalendar);

    if ( this.$container.height() < 465 ) {
      this.find('.left-overflow-wrapper').find('.left-wrapper').css({'overflow-y': 'auto', 'overflow-x': 'hidden'});
    }

    fastclick(document.body);

    // if (!this.landscape) this._preventiOSBounce();

    this.autocomplete = new google.maps.places.Autocomplete(this.find('.change-address')[0], {
      types: ['address'],
      componentRestrictions: { country: 'us' }
    });

    this.earlyVoteSites = options.data.earlyVoteSites;
    this.dropOffLocations = options.data.dropOffLocations;
    if (this.earlyVoteSites || this.dropOffLocations || this.locationTypes.hasPollingLocations)
      this.find('#location-legend')
        .show()

    if (!this.locationTypes.hasEarlyVoteSites)
      this.find('.red')
        .remove();

    if (!this.locationTypes.hasDropOffLocations)
      this.find('.grey')
        .remove();

    if (!this.locationTypes.hasBoth)
      this.find('.green')
        .remove()

    if (!this.locationTypes.hasPollingLocations)
      this.find('.blue')
        .remove()


    if (options.data.pollingLocations && options.data.pollingLocations.filter(function(location) {
      return (location.isEarlyVote === false && location.isDropOffLocation === false);
    }).length === 0)

    if (!options.data.contests)
      this.find('#ballot-information')
        .remove()

    var electionAdministrationBody = this.find('#more-resources .correspondence-address.box');
    if (!electionAdministrationBody.find(':not(h1)').text().trim().length)
      electionAdministrationBody.prev().remove(), electionAdministrationBody.remove()

    window.setTimeout(this.closeAlert.bind(this), 8000);

    this.find('.change-address').on('keypress', function() {
      $('.pac-container').last().css('z-index', 100000);
    });

    // if (options.data.currentLocation) {
    //   console.log('current Location' + options.data.currentLocation)
    //   window.console && console.log(this.map)
    //   // this.map.setCenter(options.data.currentLocation)
    // }

    this.find('#location-legend-close').on('click', function() {
      this.find('#location-legend').fadeOut('fast');
    }.bind(this));

    this.find('#polling-location-info-close').on('click', function(e) {
      this.find('#location').fadeOut('fast');
    }.bind(this));

    var localLinks = this.find('.election-administration-body a #local-jurisdiction-title');
    var stateLinks = this.find('.election-administration-body a #state-elections-office');

    if (localLinks.length) localLinks.forEach(function(localLink) {
      if (stateLinks.length) stateLinks.forEach(function(stateLink) {
        if (localLink.attr('href') === stateLink.attr('href'))
          stateLink.remove();
      })
    })

  },

  closePopUps: function (e) {
    if ( !$(e.target).is( $(".add-to-calendar-checkbox") ) )
      this.find(".add-to-calendar-checkbox").attr("checked", false)
  },

  onRemove: function() {
    if (this.autocomplete) google.maps.event.clearInstanceListeners(this.autocomplete);

    this.markers = [];

    this.timeouts.forEach(clearTimeout)

    this.$container.css({
      'width' : '',
      'height' : '',
      'left' : '',
      'top' : ''
    });

    $('#_vitModal').remove();

    if (this.modal) {
      $("#_vit").prependTo($(this.initialParent));
    }

    $('#viewport-mobile-web-tag').remove();

    $(window).off('.mapview');
  },

  _modifyExternals: function () {
    $('html, body')
      .addClass('max-height')
      .find('#_vitModal')
        .show()
        .one('click', function() {
          $(this).hide();
          this.triggerRouteEvent('mapViewBack')
        }.bind(this))
      .end()
  },

  _preventiOSBounce: function() {
    var allowUp
      , allowDown
      , slideBeginY
      , slideBeginX;
    this.$container.on('touchstart', function(event){
      allowUp = (this.scrollTop > 0);
      allowDown = (this.scrollTop < this.scrollHeight - this.clientHeight);
      slideBeginY = event.originalEvent.pageY;
      slideBeginX = event.originalEvent.pageX
    });

    this.$container.on('touchmove', function(event){
      var up = (event.originalEvent.pageY > slideBeginY);
      var down = (event.originalEvent.pageY < slideBeginY);
      var horizontal = (event.originalEvent.pageX !== slideBeginX);
      $(window).scrollLeft(0);
      slideBeginY = event.originalEvent.pageY;
      if (((up && allowUp) || (down && allowDown))) {}
      else {
        event.preventDefault();
      }
    });
  },

  _switchToLandscape: function(options) {
    if (this.modal) this._modifyExternals();
    this.$el
      .addClass('landscape')
      .prepend(
        this.find('.left')
          .detach()
          .wrapAll('<div class="left-overflow-wrapper"><div class="left-wrapper" />')
          .parent()
          .prepend($('<div class="left box" id="vip-logo">')
            .css('background-image', 'url(' + options.smallLogo + ')')
          )
      )
      .find('.right')
        .wrapAll('<div class="right-wrapper" />')
      .end()
      .find('.toggle-image')
        .addClass('arrow')
        .filter('.plus')
          .attr('src', 'https://s3.amazonaws.com/vip-voter-information-tool/images/left-arrow-white.png')
          .addClass('right-arrow')
        .end()
        .filter('.minus')
          .attr('src', 'https://s3.amazonaws.com/vip-voter-information-tool/images/right-arrow-white.png')
          .addClass('left-arrow')
      .end()
      .find('#polling-location .arrow')
        .toggleClass('hidden')
      .end()
      .find('#more-resources, .contests.right')
        .hide()
      .end()

    this.landscape = true;
  },

  _generateMap: function (position, zoom, $el) {
    var options = {
      zoom: zoom,
      center: position,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      draggable: false,
      panControl: false,
      zoomControl: false,
      scrollwheel: false,
      mapTypeControl: false,
      streetViewControl: false
    };
    if (this.landscape) {
      options.draggable = true;
      options.scrollWheel = true;
      options.zoomControl = true;
    }
    var map = new google.maps.Map($el, options)
    map.set('styles', [
      {
        featureType: "road",
        elementType: "labels",
        stylers: [ { lightness: 20 } ]
      },{
        featureType: "administrative.land_parcel",
        elementType: "all",
        stylers: [ { visibility: "off" } ]
      },{
        featureType: "landscape.man_made",
        elementType: "all",
        stylers: [ { visibility: "off" } ]
      },{
        featureType: "transit",
        elementType: "all",
        stylers: [ { visibility: "off" } ]
      },{
        featureType: "road.highway",
        elementType: "labels",
        stylers: [ { visibility: "off" } ]
      },{
        featureType: "road.arterial",
        elementType: "labels",
        stylers: [ { visibility: "off" } ]
      },{
        featureType: "water",
        elementType: "all",
        stylers: [ 
          { hue: "#a1cdfc" },
          { saturation: 39 },
          { lightness: 49 }
        ]
      },{
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [ { hue: "#f49935" } ]
      },{
        featureType: "road.arterial",
        elementType: "geometry",
        stylers: [ { hue: "#fad959" } ]
      }
    ]);
    return map;
  },

  _encodeAddressAndInitializeMap : function(address, currentLocation) {
    var that = this;
    var any = (address !== void 0);
    var zoom = any ? 12 : 3;
    var geocodeAddress = any ? address : "United States of America";

    this._geocode(geocodeAddress, function(position) {
      that.map = that._generateMap((currentLocation ? currentLocation : position), zoom, that.find('#map-canvas').get(0));

      that._geocode(that._parseAddressWithoutName(that.data.normalizedInput), function(location) {
        var marker = new google.maps.Marker({
          map: that.map,
          position: location
        });
      });

      if (any) {
        google.maps.event.addListener(that.map, 'click', function() {
          if (that.landscape) {
            that.find('.polling-location-info').slideUp('fast');
            that.toggleMap();
            // that.map.panTo((currentLocation ? currentLocation : position))
          } 
          if (currentLocation)
            that.map.panTo(currentLocation)
          else
            that._fitMap();

          // that.map.panTo(position)
          // that.find('#location .address').replaceWith($(that.addressPartial(address)));
          that.find('#location').hide();

          // if (currentLocation)
            // that.map.panTo(currentLocation)
        });

        that.find('#map-canvas').on(that._transitionEnd(), function() {
          google.maps.event.trigger(that.map, 'resize');
        });

      } else {
        that.find('#location')
          .find('a')
            .remove()
          .end()
          .find('.address')
            .css('text-align', 'center')
            .text('No Polling Locations Found')
      }
    });
  },

  _fitMap: function() {
    if (this.markers.length === 1) this.map.setZoom(15);
    else {
      var bounds = new google.maps.LatLngBounds();
      for(var i=0;i<this.markers.length;i++) {
        bounds.extend(this.markers[i].getPosition());
      }

      this.map.fitBounds(bounds);
    }
  },

  _addPollingLocation: function(position, address, location, saddr, isEarlyVote, isBoth, isDropOffLocation, isBothPollingAndDropOff) {
    var that = this;
    var daddr = this._parseAddressWithoutName(address);
    var saddr = this._parseAddressWithoutName(saddr);
    var url = 'https://s3.amazonaws.com/vip-voter-information-tool/images/' + (isEarlyVote ? 'red-marker.png' : 'blue-marker.png');
    if (isDropOffLocation && !isEarlyVote && !isBothPollingAndDropOff) {
      url = 'https://s3.amazonaws.com/vip-voter-information-tool/images/gray-marker.png';
    }
    if (isBoth) url = 'https://s3.amazonaws.com/vip-voter-information-tool/images/green-marker.png'

    var marker = new google.maps.Marker({
      map: this.map,
      position: position,
      icon: url
    });
    this.markers.push(marker);

    google.maps.event.addListener(marker, 'click', this._markerFocusHandler.bind(this, marker, address, location, saddr, daddr));
  },

  _calculateDistance: function(fromLocation, toLocation, callback) {
    var that = this;
    this._geocode(fromLocation, function(fromCoords) {
      that._geocode(toLocation, function(toCoords) {
        callback(google.maps.geometry.spherical.computeDistanceBetween(fromCoords, toCoords));
      });
    })
  },

  _transitionEnd: function() {
    var i,
      undefined,
      el = document.createElement('div'),
      transitions = {
        'transition':'transitionend',
        'OTransition':'otransitionend',
        'MozTransition':'transitionend',
        'WebkitTransition':'webkitTransitionEnd'
      };

    for (i in transitions) {
      if (transitions.hasOwnProperty(i) && el.style[i] !== undefined) {
        return transitions[i];
      }
    }
  },

  _geocode: function(location, callback, error, count) {
    var that = this;
    var geocoder = new google.maps.Geocoder();
    // if (count === 10) return;
    geocoder.geocode({
      'address': this._parseAddressWithoutName(location)
    }, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) callback(results[0].geometry.location);
      else  {
        error(status);
        setTimeout(that._geocode.bind(that, location, callback, error, count + 1), 2000);
      };
    });
  },

  _geocodeSequence: function (locations, normalizedInput) {
    var that = this;
    if (!locations.length) return;

    var timeout = locations.length > 10 ? 1000 : 100
      locations.forEach(function(location, idx) {
      that.timeouts.push(setTimeout(function () {
        that._geocode(
          location.address, 
          function(position) {
            that._addPollingLocation(
              position,
              location.address,
              location,
              normalizedInput,
              location.isEarlyVoteSite,
              location.isBoth,
              location.isDropOffLocation,
              location.isBothPollingAndDropOff
            );
          }, function(status) {
          },
          0
        );
      }, timeout * idx));
    });
  },

  _autocompleteHandler: function () {
    if (this.hasSubmitted) return;
    var address;
    if (this.autocomplete.getPlace()) address = this.autocomplete.getPlace().formatted_address;
    if (typeof address === 'undefined') {
      var autocompleteContainer = $('.pac-container').last().find('.pac-item-query').first();
      address = autocompleteContainer.text() + ' ' +
        autocompleteContainer.next().text();
    }
    this.hasSubmitted = true;

    this._makeRequest({
      address: address,
      success: function(response) {
        this.hasSubmitted = false;
        this.triggerRouteEvent('mapViewSubmit', response);
      }.bind(this),
      error: this.handleAddressNotFound
    });
  },

  autocompleteListener: function () {
    if (this.hasSubmitted) return;
    var enteredAddress = this.autocomplete.getPlace();
    var addrStr = JSON.stringify(enteredAddress);
    if (typeof enteredAddress === 'undefined' ||
        typeof enteredAddress.formatted_address === 'undefined') {
      if (typeof enteredAddress !== 'undefined' && typeof enteredAddress.name !== 'undefined') enteredAddress = enteredAddress.name;
      else {
        // may not be necessary
        var autocompleteContainer = $('.pac-container').last().find('.pac-item-query').first();
        enteredAddress = autocompleteContainer.text() + ' ' +
          autocompleteContainer.next().text();
      }
    } else enteredAddress = enteredAddress.formatted_address;

    var enteredInput = this.find('.change-address').val();

    if (enteredInput.length > enteredAddress.length) enteredAddress = enteredInput;

    this.address = enteredAddress;

    this.hasSubmitted = true;
    this._makeRequest({
      address: enteredAddress
    });

    // this.toggleLoadingDisplay();
  },
  changeAddress: function(e) {
    var that = this;
    var addressInput = this.find('.change-address');

    // brings up change address bar if you click .address on left, but not if you click .address on map:
    if ( $(e.currentTarget).hasClass("address") && $(e.currentTarget).closest("#location").length > 0 ) return;

    if (addressInput.is(':hidden')) {
      this.find("#vote-address-edit").hide();
      addressInput.prev().hide();
      addressInput.show();
      this.find('#submit-address-button').show();
      if (!this.landscape) this.find('#fade').fadeTo('fast', .25);

      $('.pac-container').addClass('pac-nudge');

      addressInput.on('focus', function() {
        addressInput.val("");
      })

      $(window).on('keypress', function(e) {
        if (this.hasSubmitted) return;
        var key = e.which || e.keyCode;
        if (key === 13) {
          google.maps.event.trigger(this.autocomplete, 'place_changed');
          if (this.hasSubmitted) return;
          addressInput.replaceWith(addressInput.clone());
        }
      }.bind(this));

      google.maps.event.addListener(this.autocomplete, 'place_changed', this.autocompleteListener.bind(this));
    } else {
      this.find("#vote-address-edit").show();
      google.maps.event.clearInstanceListeners(this.autocomplete);

      addressInput.prev().show()
      addressInput.hide()
      this.find('#fade').fadeOut()
    }
  },

  handleAddressNotFound: function() {
    $('.change-address').val("");
    this.hasSubmitted = false;
  },

  changeElection: function(e) {
    var selected = $(this).firstElementChild;

    if ($(selected).hasClass('hidden')) {
      var electionId = selected.nextElementSibling.nextElementSibling.innerHTML;
      var address = this._parseAddress(this.data.normalizedInput);
      api({
        address: address,
        success: function(response) {
          this.triggerRouteEvent('mapViewSubmit', response)
        }.bind(this),
        electionId: electionId
      });
    }
  },

  _markerFocusHandler: function (marker, address, location, saddr, daddr) {
    // additional info partial that goes below the address
    var $locationInfo = $(this.pollingLocationPartial(location));

    // slide up the current polling location information partial
    // and then replace its information with new
    this.find('.early-vote-site').remove();
    this.find('.polling-location-info').replaceWith($locationInfo).fadeOut('slow').fadeIn('slow');

    // replace the directions link with the correct address
    this.find('#location a').attr('href', 'https://maps.google.com?daddr=' + daddr + '&saddr=' + saddr);
    $locationInfo.find('a').attr('href', 'https://maps.google.com?daddr=' + daddr + '&saddr=' + saddr);
    
    var ampersands = this.find('.early-vote-site').text().match(/ &/g);
    if (ampersands && ampersands.length > 1) {
      var newLocationText = this.find('.early-vote-site').text().replace(' & ', ', ');
      this.find('.early-vote-site').text(newLocationText);
    }

    this.toggleMap.call(this, null, marker, address);

    var earlyVoteTag = this.find('.early-vote-site');
    if (earlyVoteTag.length > 1)
      earlyVoteTag.last().remove()
  },

  toggleMap: function(e, marker, address) {
    var markerSelected = true;
    if (typeof marker === 'undefined') {
      markerSelected = false;
      marker = this.markers[0];
    }
    if (!this.landscape) {
      var canvas = this.find('#map-canvas');
      var toggle = this.find('#map-toggle');
      if (canvas.height() !== 300 && (!markerSelected)) {
        toggle.find('.minus').removeClass('hidden');
        toggle.find('.plus').addClass('hidden');

        canvas.animate({ height: '300px' }, {
          duration: 500,
          complete: function() {
            this._scrollTo(toggle, 10);
            // this.map.panTo(marker.getPosition());
            this._fitMap();
          }.bind(this)
        });

        if (address) this.find('#location .address').replaceWith($(this.addressPartial(address)));
        this.find('.polling-location-info').slideDown('fast');
      } else if (!markerSelected) {
        canvas.animate({ height: '150px' }, {
          duration: 500,
          complete: function() {
            this._scrollTo(toggle, 10);
            this.map.panTo(marker.getPosition());
            this.map.setZoom(12);
            // this._fitMap();
          }.bind(this)
        });
        toggle.find('.plus').removeClass('hidden');
        toggle.find('.minus').addClass('hidden');

        this.find('.polling-location-info').slideUp('fast');
      } else {
        this.map.panTo(marker.getPosition());
        var isSameLocation = (this.find('#location .address').text() === $(this.addressPartial(address)).text());
        if (address) this.find('#location .address').replaceWith($(this.addressPartial(address)));
        if (isSameLocation) this.find('.polling-location-info').slideToggle('fast');
        else this.find('.polling-location-info').slideUp('fast');
      }
    } else {
      this.find('.right-wrapper').css('overflow', 'hidden');
      if (this.find('#location').is(':visible')) {
        // this._fitMap();
        this.map.panTo(marker.getPosition());
        if (address) {
          var isSameLocation = (this.find('#location .address').text() === $(this.addressPartial(address)).text());
          if (isSameLocation) this.find('.polling-location-info').show();
          else {
            this.find('#location .address').replaceWith($(this.addressPartial(address)));
            this.find('.polling-location-info').show();
            if (this.find('.polling-location-info').is(':hidden')) {
              // this.find('.polling-location-info').slideDown('fast');
            } else {
              // setTimeout(function() {
                // this.find('.polling-location-info').slideDown('fast');
              // }.bind(this), 500);
            }
          }
        }
      } else {
        this.find('.info.box').removeClass('expanded-pane');
        this.find('#polling-location').addClass('expanded-pane')
        this.find(':not(#polling-location) .right-arrow').removeClass('hidden');
        this.find(':not(#polling-location) .left-arrow').addClass('hidden');
        this.find('#more-resources, .contests, #about-resources').hide();
        this.find('#polling-location .right-arrow').addClass('hidden');
        this.find('#polling-location .left-arrow').removeClass('hidden');

        if (this.mapIsDisplayed)
          this.find('#map-canvas, #location, #location-legend, #map-view-toggle').show();
        else
          this.find('#map-list-view, #map-view-toggle').show();

        this.map.panTo(marker.getPosition());
      }
    }

    var addressNames = this.find('#location .address-name');
    if (addressNames.length > 1 &&
      (addressNames.first().text() === addressNames.last().text()))
      addressNames.first().remove();
  },

  toggleElections: function(e) {
    if (typeof this.data.otherElections === 'undefined') return;
    e.stopPropagation();
    this.find('#election-list').slideToggle(100, function() {
      if (!this.landscape) this._scrollTo($('#more-elections span'), 10)
    }.bind(this));
    if (!this.landscape)
      this.find('#more-elections')
        .find('.toggle-image').toggleClass('hidden');
  },

  toggleResources: function(e) {
    this.find('.right-wrapper')
      .css('overflow', 'hidden')
      .scrollTop(0)
      .css({
        'overflow-y': 'scroll',
        'overflow-x': 'hidden'});
    if (!this.landscape)
      this.find('#more-resources').slideToggle(500, function() {
        this._scrollTo($('#resources-toggle span'), 10);
        this.find('#resources-toggle')
          .find('.plus, .minus')
            .toggleClass('hidden');
      }.bind(this));
    else {
      this.$el
        .find('#about-resources')
          .css("height", "initial")
          .show()
          .find('span')
            .show()
          .end()
        .end()
        .find('#map-canvas, #location, #location-legend, #map-list-view, #map-view-toggle, .contests')
          .hide()
        .end()
        .find('.info.box')
          .removeClass('expanded-pane')
        .end()
        .find('#resources-toggle')
          .addClass('expanded-pane')
        .end()
        .find(':not(#resources-toggle)')
          .find('.right-arrow')
            .removeClass('hidden')
          .end()
          .find('.left-arrow')
            .addClass('hidden')
          .end()
        .find('#resources-toggle')
          .find('.right-arrow')
            .addClass('hidden')
          .end()
          .find('.left-arrow')
            .removeClass('hidden')
          .end()


      this.find('#more-resources')
        .css({
          'max-height':'20000px'
        }).show();
    }
  },

  toggleBallot: function() {
    this.find('.right-wrapper')
      .css('overflow', 'hidden')
      .scrollTop(0)
      .css({
        'overflow-y':'scroll',
        'overflow-x':'hidden'
      });
    if (!this.landscape) {
      var ballotInfoIsMaximized = this.find('#ballot-information').find('.plus').is(":hidden");

      this.find('#ballot-information').find('.plus, .minus').toggleClass('hidden');
      this.find(".contest-toggle").each(function (i, el) {
        var candidateList = $(el).find('.candidate-list');
        var toggleSign = $(el).find('span');
        var subsectionIsMaximized = !candidateList.is(':hidden');

        if (ballotInfoIsMaximized === subsectionIsMaximized) {
          candidateList.slideToggle(500, function() {
            var text = (subsectionIsMaximized ? '+ ' : '\u2013')
            toggleSign.text(text);
          }.bind(this));
        }
      });

      if (!ballotInfoIsMaximized) this._scrollTo($("#ballot-information"), 20);

    } else {
      this.find("#about-resources span").hide().end()
        .find('#map-canvas, #location, #location-legend, #map-list-view, #map-view-toggle, #more-resources, #about-resources').hide().end()
        .find('.info.box').removeClass('expanded-pane').end()
        .find('#ballot-information').addClass('expanded-pane')
          // .find('.arrow').toggleClass('hidden')
        .end()
        .find(':not(#ballot-information)')
          .find('.right-arrow')
            .removeClass('hidden')
          .end()
          .find('.left-arrow')
            .addClass('hidden')
          .end()
        .end()
        .find('#ballot-information')
          .find('.right-arrow')
            .addClass('hidden')
          .end()
          .find('.left-arrow')
            .removeClass('hidden')
          .end()
        .end()

        .find('.contests').show().end()
        .find('#about-resources').css("height", "initial").end()
        .find('#about-resources').css("height", "0px")
    }
  },

  toggleContest: function(e) {
    if ($(e.target).hasClass('subsection') ||
        $(e.target).hasClass('subsection-plus') ||
        $(e.target).parent().hasClass('subsection') || 
        $(e.target).parent().hasClass('subsection-plus')) {
      var candidateList = $(e.currentTarget).find('.candidate-list');
      var toggleSign = $(e.currentTarget).find('span');

      candidateList.slideToggle(500, function() {
        var isHidden = candidateList.is(':hidden')
        if (isHidden) {
          toggleSign.css({
            'position' : 'relative',
            'left' : '-2px'
          });
          this._scrollTo(toggleSign, 20);
        } else {
          toggleSign.css({
            'position': '',
            'left' : ''
          })
        }
        toggleSign.text((isHidden ? '+' : '\u2013'));
      }.bind(this));
    }
  },

  toggleMapListView: function() {
    this.mapIsDisplayed = !this.mapIsDisplayed;
    this.find('#map-list-view, #location, #location-legend, #map-canvas').toggle();
    // this.find('#map-list-view').toggle();
    this.find('#about-resources').hide();

  },

  submitAddress: function() {
    google.maps.event.trigger(this.autocomplete, 'place_changed'); 
  },

  _scrollTo: function(target, padding) {
    $(this.$container).animate({
      scrollTop: target.offset().top - $(this.$container).offset().top + $(this.$container).scrollTop() - padding
    }, 500);
  },

  back: function() {
    this.triggerRouteEvent('mapViewBack');
  },

  openAboutModal: function(e) {
    this.find('#about').fadeIn('fast');
    this.find('#fade').fadeTo('fast', .2);
    e.stopPropagation();
  },

  closeAboutModal: function() {
    this.find('#about').fadeOut('fast')
    this.find('#fade').fadeOut('fast')
  },

  closeAlert: function() {
    this.find('#alert').fadeOut('slow', function() {
      if (this.find('#location-legend').is(':visible'))
        this.find('#location-legend')
          .css('top', '2%');
    }.bind(this));
  }
});