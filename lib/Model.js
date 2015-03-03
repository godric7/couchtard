'use strict';

var debug  = require('debug')('ct:model');
var util   = require('util');

function Model(src, key, obj, meta) {
  // debug('+ Model.contructor "%s"', key);

  // @key params is optional, if key is an obj, shift rgs
  if (key instanceof Object) { 
    meta = obj; obj = key; key = undefined; 
  }

  // Reference source db
  var type = this.constructor.name.toLowerCase();
  Object.defineProperty(this, '_key',  { writable: true,  value: key });
  Object.defineProperty(this, '_src',  { writable: false, value: src });
  Object.defineProperty(this, '_type', { writable: false, value: type });
  Object.defineProperty(this, '_meta', { writable: true,  value: meta || {} });
  // Model wide properties
  Object.defineProperties(this, this.properties);
  util._extend(this, obj || {});
}

Model.prototype.properties = {};

/************************* database *************************/

/**
 * Get model values from database
 */
Model.prototype.add = function(callback) {
  debug('+ Model.prototype.add');
  var self = this;
  var opts = {cas: self._meta.cas};

  self._src.add(self, opts, callback);
};

/**
 * Save model 
 */
Model.prototype.save = function(callback) {
  debug('+ Model.prototype.save');
  var self = this;
  var opts = {cas: self._meta.cas};
  self._src.save(self, callback);
};

/**
 * Update model from obj to database
 */
Model.prototype.update = function(obj, callback) {
  debug('+ Model.prototype.update');
  util._extend(this, obj);
  this.save(callback);
};

/**
 * Update model 
 */
Model.prototype.delete = function(callback) {
  debug('+ Model.prototype.delete');
  var self = this;
  self._src.delete(self, callback);
};

/************************* hooks *************************/

/**
 * Called before the model is validated and saved 
 */
Model.prototype.before_save = function(callback) {
  debug('+ Model.prototype.before_save');
  callback(null);
};

/**
 * Called before the model is deleted
 */
Model.prototype.before_delete = function(callback) {
  debug('+ Model.prototype.before_delete');
  callback(null);
};


/************************ methods ************************/

/**
 * Validate model 
 */
Model.prototype.validate = function(callback) {
  debug('+ Model.prototype.validate');
  callback(null);
};

/**
 * Populate model 
 */
Model.prototype.populate = function(fields, callback) {
  debug('+ Model.prototype.populate');
  this._src.populate(this, fields, callback);
};

/************************* utils *************************/

/**
 * Pretty print
 */
Model.prototype.inspect = function() {
  debug('+ Model.prototype.inspect');
  var keys = Object.getOwnPropertyNames(this);
  var priv = {};

  for (var idx in keys) {
    var key = keys[idx];
    if (key != '_src' && !(this.propertyIsEnumerable(key)))
      priv[key] = this[key];
  }
  return [
    '---------------['+this._key+']----------------',
    '- - - - - - - - - - - - - - - - - - [public] - - - - - - - - - - - - - - - - - -',
    JSON.stringify(this, null),
    '- - - - - - - - - - - - - - - - - - [private] - - - - - - - - - - - - - - - - - ',
    JSON.stringify(priv, null),
    '--------------------------------------------------------------------------------',
  ].join('\n');
};


module.exports = Model;