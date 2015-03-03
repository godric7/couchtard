
# CouchTard

#### Documentation Index
 * [Setup](#setup)
 * [Bucket](#bucket)
   * [Basics](#basics)
   * [Advanced](#advanced)
 * [Models](#models)
   * [Basics](#basics)
   * [Miscellaneous](#miscellaneous)
 * [Views](#views)
 * [Streaming](#streaming)

# Introduction

## Usage

```bash

var ct = require('couchtard');

// Couchtard only manipulate object derived from the Model prototype.
// Basic is provided as an exemple, it will keep up to date informations about
// creation/update dates types and id in the document.

var models = {
  'basic': ct.Basic
};

var bucket = new bucket({
  url      : 'couchbase://db.host.net'
  username : 'Administrator'
  password : 'xxxxxxxxxxxxx'
}, models, function(err) {
  console.log('error:', err);
}); 

var stream = new Stream(bucket);

```

# Bucket

### Basics

#### Add
```javascript
// Add one item
bucket.add(key, function(err, item) {
  console.log(key + ' added (insert).')
});
// Add multiple items
bucket.add_multi([item1, item2], function(err) {
  console.log('Items added (insert).');
});
```

#### Get
```javascript
// Get one item
bucket.get(key, function(err, item) {
  console.log(key + ' retrieved.')
});
// Get multiple items
bucket.get_multi([key1, key2], function(err, items) {
  console.log('Items retrieved.');
});
```

#### Save
```javascript
// Save one item
bucket.save(item, function(err) {
  console.log(item._key + ' saved.')
});
// Save multiple items (array)
bucket.save_multi([item1, item2], function(err) {
  console.log('Items saved.');
});
// Save multiple items (hash)
bucket.save_multi({key1: item1, key2: item2}, function(err) {
  console.log('Items saved.');
});
```

#### Delete

```javascript
// Delete one item
bucket.delete(key, function(err) {
  console.log(key + ' deleted.')
});
// Delete multiple items
bucket.delete_multi([key1, key2], function(err) {
  console.log('Items saved.');
});
```

### Miscellaneous

#### Lock
```javascript
// Lock one item
bucket.lock(key, function(err, item) {
  console.log(key + ' locked.');
});
// Lock multiple items
bucket.lock_multi([key1, key2], function(err, item) {
  console.log('Items locked.');
});
```
_Note: Saving locked item(s) will release the lock_

#### Unlock
```javascript
// Unlock one item
bucket.unlock(item, function(err, item) {
  console.log(item._key + ' unlocked.')
});
// Unlock multiple items (array)
bucket.unlock_multi([item1, item2], function(err, item) {
  console.log('Items unlocked.')
});
// Unlock multiple item (hash)
bucket.unlock_multi({key1: item1, key2: item2}, function(err, item) {
  console.log('Items unlocked.')
});
```

#### Populate
```javascript
var item1 = {rel_key: 'xxxx-xxxx-xxx'};
var item2 = {rel_key: 'yyyy-yyyy-yyy'};

// Get related models instances
bucket.populate(item1, {rel_key: rel_item}, function(err, item) {  
  console.log(item1); // {rel_key: 'xxxx-xxxx-xxx', rel_item: {...}};
});
// Get related models instances for multiple items (array)
bucket.populate_multi([item1, item2], {rel_key: rel_item}, function(err, items) {  
  console.log(item[0]); // {rel_key: 'xxxx-xxxx-xxx', rel_item: {...}};
  console.log(item[1]); // {rel_key: 'yyyy-yyyy-yyy', rel_item: {...}};
});
// Get related models instances for multiple items (hash)
bucket.populate_multi({'item1': item1, 'item2':item2}, {rel_key: rel_item}, function(err, items) {  
  console.log(items.item1); // {rel_key: 'xxxx-xxxx-xxx', rel_item: {...}}
  console.log(items.item2); // {rel_key: 'yyyy-yyyy-yyy', rel_item: {...}}
});
```

# Models

### Basics

#### Basics

```javascript
// Create Item from Model Artists, with key "artist-1"
var item = bucket.new('artist', 'artist-1', {name: "Gorillaz"});

// If the key is ommited, a random key will be generated
var item = bucket.new('artist', {name: "Gorillaz"});
```


#### Add

```javascript
// Add item (insert)
item.add(function(err) {
  console.log(item._key + ' was added.');
});
```
#### Save

```javascript
// Save item
item.save(function(err) {
  console.log(item._key + ' was saved.');
});
```

#### Update

```javascript
// Update (modify and save) item
item.update(obj, function(err, item) {
  console.log(item._key + ' was modified.');
});
```
#### Delete

```javascript
// Delete item
item.delete(function(err) {
  console.log(item._key + ' was deleted.');
});
```

### Miscellaneous

#### Populate

```javascript
// Delete item
var item = {rel_key: 'xxxx-xxxx-xxx'};
item.populate({rel_key: rel_item} function(err) {
  console.log(item); // {rel_key: 'xxxx-xxxx-xxx', rel_item: {...}}
});
```

# Views

The following exemple assume that the view ddoc/view contents are :
```javascript
[
  {"key": "Shiny Strawberry", "id": "item1", "value": null}
  {"key": "Shiny Dance Gown", "id": "item2", "value": null},
  {"key": "Dull Thingamabob", "id": "item3", "value": null},
]
```

#### View

The basic view mechanism, mostly a wrapper around Couchabase's ViewQuery
```javascript
// Fetch view results
bucket._view('items', 'by_name', {}, function(err, res, meta) {
  console.log(res) // [{"key": "Shiny Strawberry", "id": "item1", "value": null}];
});
```

The prefered way of using views is through the use of a delegate function
```javascript
// Create view delegate
function items_by_name(bucket, name, callback) {
  var opts = {startkey: name, endkey: name+'\uefff'};
  bucket._view('items', 'by_name', opts, function (err, res) {
    callback(err, res.map(function(i) { return i.key; }));
  });
}
// Fetch results from delegate with args
bucket.view(items_by_name, 'Shiny', function(err, names) {
  console.log(names); // ["Shiny Strawberry", "Shiny Dance Gown"];
});
```

#### Glimpse

To use a view as an counter and retrieve the total number of matching items.
This excpects the view to have a `_count` reduce function

```javascript
// Get the number (total) of elements whose name starts with "Shiny"
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff'};
bucket._glimpse('index', 'by_name', opts, function(err, res, meta) {
  console.log(res);  // null
  console.log(meta); // {total_rows: 2}
});
```
```javascript
// Get the number of elements whose name starts with "Shiny" and the first result
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff', limit: 1};
bucket.glimpse('index', 'by_name', opts, function(err, res, meta) {
  console.log(res);  // [{"key": "Shiny Strawberry", "id": "item1", "value": null}];
  console.log(meta); // {total_rows: 2}
});
```

#### Gaze

To use a view as an index and retrieve the emmiting items rather that the emmited values.
This will in fact also call glimpse, excpecting the view to have a `_count` reduce function

```javascript
// Fetch all items whose name starts with "Shiny"
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff', limit: 1};
bucket.gaze('index', 'by_name', opts, function(err, items, meta) {
  console.log(res);  // {"item1": {"name": "Shiny Strawberry"}}
  console.log(meta); // {total_rows: 2}
});
```
The `_gaze` primitive does not call `_glimpse`

```javascript
// Fetch all items whose name starts with "Shiny"
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff', limit: 1};
bucket._gaze('index', 'by_name', opts, function(err, items, meta) {
  console.log(res);  // {"item1": {"name": "Shiny Strawberry"}}
  console.log(meta); // {total_rows: 3}
});
```

# Streaming

The streaming support is a parallelized, efficient way of querying large views.
It basicaly is a node event stream, that will call a worker function with chunks of
results untill done, and works as a drop-in replacement to the previous function.

It recognize two special view parameters 
 * `chunkSize`: Maximum number of items to pass on to a worker function
 * `concurency`: Maximum number of simultaneous workers functions to call

#### View

```javascript
// Fetch results for items whose name start with "Shiny"
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff', chunkSize: 1};
stream._view('index', 'by_name', opts, function(err, res, meta, done) {
  console.log(res);  // [{"key": "Shiny Strawberry", "id": "item1", "value": null}];
  console.log(meta); // {total_rows: 3}
  done(err);
}, function() {
  console.log('All results have been processed');
});
```

#### Gaze

```javascript
// Fetch all items whose name starts with "Shiny"
var opts = {startkey: 'Shiny', endkey: 'Shiny\uefff', chunkSize: 1};
stream.gaze('index', 'by_name', opts, function(err, items, meta, done) {
  console.log(res);  // {"item1": {"name": "Shiny Strawberry"}};
  console.log(meta); // {total_rows: 2}
  done(err);
}, function() {
  console.log('All items have been processed');   
});
```



