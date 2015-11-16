'use strict';

var debug = require('debug')('ct:bucket-stream');

var pauseStream = require('pause-stream');
var JSONStream = require('JSONStream');
var request = require('request');

var qs = require('querystring');
var async = require('async');
var util = require('util');



/********************************** _view *************************************/

function BucketStream(bucket) {
  this.bucket = bucket;
}

/*************************************************************
 * Views works mostly like the traditional bucket._view
 * except it receive and treats the results *on the fly*
 *
 * It will buffer up to @opts.chunckSize (default: 100) rows.
 * and pass it worker(err, res, meta, done).
 * The @concurency parameters controls how many workers() can be
 * call simultanously before pausing the input stream.
 *
 * The worker() callback must call its done() callback
 * upon completion to resume the input stream.
 *
 * When the stream is empty, @callback will be called
 *
 */
BucketStream.prototype._view = function (ddoc, view, opts, concurency, worker, callback) {
  var self = this;
  var chunkSize;
  debug('+ BucketStream.prototype._view');

  // To not break old concurency passing
  if (typeof concurency === 'function') {
    callback = worker;
    worker = concurency;
  } else {
    debug('Passing BucketStream `concurency` as an argument is deprecated, use opts.concurency');
    opts.concurency = concurency;
  }
  chunkSize  = opts.chunkSize  || 100;
  concurency = opts.concurency || 4;


  // _maybeInvoke() ensure the bucket is connected
  // This is needed before calling _bu._cb.getViewNode()
  self.bucket._bucket._maybeInvoke(function() {
    try {
      var host = self.bucket._bucket._cb.getViewNode();
      var buck = self.bucket._opts.bucket;
      var type = '_view';
      var csize = chunkSize;
      var qsize = concurency * concurency;

      // Escape query parameters
      opts = self.bucket._escape_view_opts(opts);
      delete opts.chunkSize;
      delete opts.concurency;
      opts = qs.stringify(opts);

      var uri = 'http://'+host+'/'+buck+'/_design/'+ddoc+'/'+type+'/'+view+'?'+opts;
      // Requests args
      var args = {
        url: uri,
        auth: {
          username: self.bucket._opts.bucket,
          password: self.bucket._opts.password
        }
      };

      // Kill the queue
      var _kill_it_with_fire = function(err) {
        queue && queue.kill();
        finished = true;
        callback(err);
      };

      // HTTP error Handler
      var _view_rest_error = function(err, res, body) {
        if (err || res.statusCode != 200) {
          err = new Error('Unknown REST error');
          try { err = JSON.parse(body); } catch (e) {}
          _kill_it_with_fire(err);
        }
      };

      // Create streams and pipelining
      var http_s = request(args, _view_rest_error);
      var paus_s = pauseStream();
      var json_s = JSONStream.parse('rows.*');
      http_s.pipe(paus_s).pipe(json_s);


      // Queue that pass items to worker in a _view callback fashion
      var queue = async.queue(function(item, done) {
        worker(null, item.rows, {}, function () {
          if (paus_s.paused && queue.length() < qsize) {
            debug('+ BucketStream.prototype._view:resume');
            paus_s.resume();
          }
          done.apply(null, arguments);
        });
      }, concurency);

      // If the queue is empty and the http_s has ended, finish
      queue.drain = function() {
        debug('+ BucketStream.prototype._view:drain', finished);
        if (finished === true)
          _kill_it_with_fire();
      };


      // Accumulate items up to czise
      var res = [];
      var finished = false;
      json_s.on('data', function(data) {
        res.push(data);
        if (res.length >= csize) {
          queue.push({rows: res});
          res = [];
        }
        if (!paus_s.paused && queue.length() > qsize) {
          debug('+ BucketStream.prototype._view:pause');
          paus_s.pause();
        }
      });

      // Error handling
      json_s.on('error', function(err) {
        debug('+ BucketStream.prototype._view:error');
        _kill_it_with_fire(err);
      });

      // Got all the files, Finish
      json_s.on('end', function() {
        debug('+ BucketStream.prototype._view:done');
        finished = true;
        if (res.length !== 0) {
          queue.push({rows: res});
          res = [];
        } else if (queue.length() === 0){
          _kill_it_with_fire();
        }
      });
    } catch (e) {
      callback(e);
    }
  });
};

/*************************************************************
 * _gaze maps _view results id to their documents
 *
 * see bucket.prototype._gaze
 * see bucketStream.prototype._view
 */
BucketStream.prototype._gaze = function (ddoc, view, opts, concurency, worker, callback) {
  var self = this;
  debug('+ BucketStream.prototype._gaze');

  // To not break old concurency passing
  if (typeof concurency === 'function') {
    callback = worker;
    worker = concurency;
  } else {
    debug('Passing BucketStream `concurency` as an argument is deprecated, use opts.concurency');
    opts.concurency = concurency;
  }

  opts = util._extend({}, opts);
  opts.reduce = false;
  this._view(ddoc, view, opts, function(err, res, meta, done) {
    if (err) {
      worker(err, null, null, done);
    } else {
      var ids = res.map(function(r) { return r.id; });
      self.bucket.get_multi(ids, function(err, items) {
        worker(err, items, meta, done);
      });
    }
  }, callback);
};

/*************************************************************
 * gaze maps _view results id to their documents but and does
 * a preemptive _glimpse.
 *
 * see bucket.prototype.gaze
 * see bucketStream.prototype._view
 */
BucketStream.prototype.gaze = function (ddoc, view, opts, concurency, worker, callback) {
  var self = this;
  debug('+ BucketStream.prototype.gaze');

  // To not break old concurency passing
  if (typeof concurency === 'function') {
    callback = worker;
    worker = concurency;
  } else {
    debug('Passing BucketStream `concurency` as an argument is deprecated, use opts.concurency');
    opts.concurency = concurency;
  }

  self.bucket._glimpse(ddoc, view, opts, function(err, res, _meta) {
    self._gaze(ddoc, view, opts, function(err, items, meta, done) {
      worker(err, items, _meta, done);
    }, callback);
  });
};


module.exports = BucketStream;