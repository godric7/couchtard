"use strict";

var util = require('util');
var uuid = require('node-uuid');

var Model = require('../lib/Model.js');

function Basic() {
  Model.apply(this, arguments);
  if (!this.id)
    this.id = '/'+this._type+'s/'+uuid.v4();
  if (!this.created)
    this.created = (new Date()).toISOString();
  if (!this.updated)
    this.updated = this.created;
}
util.inherits(Basic, Model);

/************************** defaults **************************/
Basic.prototype.properties = util._extend({}, Model.prototype.properties);

Basic.prototype.properties.id = {
  'enumerable': true,
  get: function() { return this._key; },
  set: function(id) { this._key = id; }
};

Basic.prototype.properties.type = {
  'enumerable': true,
  get: function() { return this._type.toLowerCase(); },
  set: function() { }
};

Basic.prototype.properties.created = {
  'enumerable': true,
  'writable': true,
};

Basic.prototype.properties.updated = {
  'enumerable': true,
  'writable': true,
};

Basic.prototype._fromItemOrId = function(item, callback) {
  var self = this;

  if (typeof item === 'string') {
    self._src.get(item, callback);
  } else if (typeof item == 'object') {
    callback(null, item);
  } else {
    callback(new Error('Argument is neither object nor id'));
  }
};

/*************************** hooks ****************************/
Basic.prototype.before_save = function(callback) {
  this.updated = (new Date()).toISOString();
  Model.prototype.before_save.call(this, callback);
};

/************************** methods ***************************/

Basic.prototype.validate = function(callback) {
  if (!this.id)
    return callback(new Error("`id` cannot be empty"));
  Model.prototype.validate.call(this, callback);
};

module.exports = Basic;
