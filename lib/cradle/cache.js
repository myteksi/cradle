var Response  = require('./response').Response;
var Memcached = require('memcached');
var memcached = new Memcached;
var logger    = require('winston');


//
// Each database object has its own cache store.
// The cache.* methods are all wrappers around
// `cache.query`, which transparently checks if
// caching is enabled, before performing any action.
//
this.Cache = function (options) {
    var that = this;

    this.store   = {};
    this.options = options;
    this.size = options.cacheSize || 0;
    this.keys = 0;
};

this.Cache.prototype = {
    // API
    get:   function (id)      { return this.query('get',   id) },
    save:  function (id, doc) { return this.query('save',  id, doc) },
    purge: function (id)      { return this.query('purge', id) },
    has:   function (id)      { return this.query('has',   id) },

    _get: function (id) {
        var entry;

        memcached.get('id', function (err, result) {
            if (err) logger.error(err)
            entry = JSON.parse(result);
            entry.atime = Date.now();

            if (this.options.raw) {
                return entry.document;
            } else {
                // If the document is already wrapped in a `Response`,
                // just return it. Else, wrap it first. We clone the documents
                // before returning them, to protect them from modification.
                if (entry.document.toJSON) {
                    return clone(entry.document);
                } else {
                    return new(Response)(clone(entry.document));
                }
            }
        });
    },
    _has: function (id) {
        memcached.get('id', function (err, result) {
            if (err) logger.error(err)
            return JSON.parse(result)
        });
        //return id in this.store;
    },
    _save: function (id, doc) {
        memcached.set(id, { atime: Date.now(), document: doc  }, 10000, function (err, result) {
            if (err) logger.error(err);
            logger.info(result);
        });
    },
    _purge: function (id) {
        if (id) {
            delete(this.store[id]);
            this.keys --;
        } else {
            this.store = {};
        }
    },
    query: function (op, id, doc) {
        if (this.options.cache) {
            return this['_' + op](id, doc);
        } else {
            return false;
        }
    },
};

function clone(obj) {
    return Object.keys(obj).reduce(function (clone, k) {
        if (! obj.__lookupGetter__(k)) {
            clone[k] = obj[k];
        }
        return clone;
    }, {});
}
