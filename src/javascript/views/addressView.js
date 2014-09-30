var View = require('./view.js');
var api = require('../api.js');
var $ = require('jquery');

module.exports = View.extend({

  $id          : 'address-view',

  template     : require('./templates/address-lookup.hbs'),

  multipleElections : require('./templates/partials/multiple-elections.hbs'),

  events : {
    '#plus-icon click' : 'openAboutModal',
    '#close-button click' : 'closeAboutModal',
    '#submit-address-button click' : 'submitAddress'
  },

  hasSubmitted: false,

  address : '',

  resizer: function () {
    $("#_vit").find("#about.modal").css({"max-height": $("#_vit").height() - 120 + "px"});
  },

  onAfterRender : function(options) {
    var $address = this.find('#address-input');
    var $aboutModal = this.find('#about');
    var $notFoundModal = this.find('#address-not-found');
    var $currentLocationModal = this.find('#current-location');

    this.$container.css({
      'max-width': 800,
      'width' : options.width,
      'height' : options.height
    });

    if (this.$container.width() > 600) {
      $('#user-image').css('max-width', '85%');
    }

    $('body').on('click', function(e) {
      if (e.target !== $aboutModal) $aboutModal.hide();
      if (e.target !== $notFoundModal) $notFoundModal.hide();
      if (e.target !== $currentLocationModal) $currentLocationModal.hide();
      if (e.target !== this.find('#fade')) this.find('#fade').fadeOut('fast');
    }.bind(this));
    this.autocomplete = new google.maps.places.Autocomplete($address[0], {
      types: ['address'],
      componentRestrictions: { country: 'us' }
    });
    this.hasSubmitted = false;
    this.autocompleteListener = function () {
      if (this.hasSubmitted) return;
      enteredAddress = this.autocomplete.getPlace();
      if (typeof enteredAddress === 'undefined' || typeof enteredAddress.formatted_address === 'undefined') {
        var autocompleteContainer = $('.pac-container').last().find('.pac-item-query').first();
        enteredAddress = autocompleteContainer.text() + ' ' +
          autocompleteContainer.next().text();
      } else enteredAddress = enteredAddress.formatted_address
      this.address = enteredAddress;
      this.hasSubmitted = true;
      this._makeRequest({
        address: enteredAddress
      });

      this.toggleLoadingDisplay();
    }.bind(this);
    this.keypressListener = function(e) {
      if (this.hasSubmitted) return;
      var key = e.which || e.keyCode;
      if (key === 13) {
        google.maps.event.trigger(this.autocomplete, 'place_changed');
      }
    }

    $(document).on({
      'DOMNodeInserted':function() {
        $('.pac-item, .pac-item span', this).addClass('needsclick');
      }
    }, '.pac-container');

    $(window).on('keypress.keypressListener', this.keypressListener.bind(this));
    this.resizer();
    $(window).on('resize', this.resizer.bind(this));

    google.maps.event.addListener(this.autocomplete, 'place_changed', this.autocompleteListener);
  },

  submitAddress: function () {
    google.maps.event.trigger(this.autocomplete, 'place_changed'); 
  }, 

  onRemove: function() {
    google.maps.event.clearInstanceListeners(this.autocomplete);
    $(window).unbind('keypress.keypressListener')
  },

  handleElectionData: function(response) {
    var that = this;

    var stateName = response.state[0].name;
    if (stateName === 'Washington' || stateName === 'Oregon') {
      this.find('#current-location').fadeIn('fast');
      this.find('#fade').fadeTo('fast', .2);

      $('#use-current-location').one('click', function() {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(function(position) {
            var lat = position.coords.latitude
              , lng = position.coords.longitude;
            that._reverseGeocode(
              position.coords.latitude,
              position.coords.longitude,
              function(address) {
                that._makeRequest({
                  address: address,
                  success: function(newResponse) {
                    that.triggerRouteEvent('addressViewSubmit', newResponse);
                  },
                  error: function() {
                    that.triggerRouteEvent('addressViewSubmit', response);
                  }
              });
            });
          });
        } else {
          $('#current-location, #fade').fadeOut('fast');
          $('#address-input')
            .val('')
            .attr('placeholder', 'Enter Your Current Location');
        }
      });

      $('#use-registered-address').one('click', function() {
        that.triggerRouteEvent('addressViewSubmit', response);
      })
      return;
    }

    if (response.otherElections) {
      this.$el.append(this.multipleElections({
        elections: [response.election].concat(response.otherElections)
      }));
      this.find('#multiple-elections').fadeIn('fast');
      this.find('#fade').fadeTo('fast', .2);
      $('.checked:first').removeClass('hidden');
      $('.unchecked:first').addClass('hidden');
      $(this.find('#multiple-elections button')).on('click', function() {
        var id = this.find('.checked:not(.hidden)').siblings('.hidden').eq(0).text();
        this._makeRequest({
          address: this._parseAddress(response.normalizedInput),
          success: function(newResponse) {
            this.triggerRouteEvent('addressViewSubmit', newResponse);
          }.bind(this),
          electionId: id
        });
      }.bind(this));
      $('.election').on('click', function() {
        $('.checked').addClass('hidden');
        $('.unchecked').removeClass('hidden')
        $(this).find('.checked').removeClass('hidden');
        $(this).find('.unchecked').addClass('hidden');
      });
      
    } else this.triggerRouteEvent('addressViewSubmit', response);
  },

  handleAddressNotFound: function() {
    // this.toggleLoadingDisplay()
    // this.find('#fade').hide();
    this.find('.loading').hide();
    this.find('#address-not-found').fadeIn();
    this.find('#fade').fadeTo('fast', .2);
    this.find('#address-not-found h1').text(this.address);
    this.find('#address-input').value = "";
    this.hasSubmitted = false;
  },

  selectElection: function(e) {
    var electionId = e.currentTarget.querySelector('.hidden');
    this.triggerRouteEvent('');
  },

  openAboutModal: function(e) {
    this.find('#fade').fadeTo('fast', .2);
    this.find('#about').fadeIn('fast')
   
    if ( ($("#_vit").find("#about.modal").find("p").height() + $("#_vit").find("#about.modal").find("h2").height()) > ($("#_vit").height() - 120) ) {
      $("#_vit").find("#about.modal").find("#close-button").hide();
       $("#_vit").find("#about.modal").find(".close-modal-text-button").toggle();
    }

    e.stopPropagation();
  },

  closeAboutModal: function() {
    this.find('#about').fadeOut('fast');
    this.find('#fade').fadeOut('fast');
  },

  _reverseGeocode: function(lat, lng, callback) {
    var latLng = new google.maps.LatLng(lat, lng);
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({
      'latLng': latLng
    }, function(results, status) {
      if (status === google.maps.GeocoderStatus.OK) {
        if (results[1]) {
          callback(results[1].formatted_address);
        }
      }
    })
  }
});