var Response  = require('./response').Response;
var Memcached = require('memcached');
var logger    = require('winston');
var async     = require('async');
var util      = require('util');

Memcached.config.poolSize = 255;
Memcached.config.maxExpiration = 15000;
var memcached = new Memcached;

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
    get:   function (id, callback) {
       this.query('get', id, null, function (err, result) {
            if (err) {
                logger.error(util.inspect(err));
                callback(err)
            } else {
                callback(null, result)
            }
        });
    },
    save:  function (id, doc) { return this.query('save',  id, doc) },
    purge: function (id)      { return this.query('purge', id) },
    has:   function (id, callback) {
        this.query('has', id, null, function (err, result) {
            if (err) logger.error(util.inspect(err));
            // console.log('[has] Got record from memcached? ' + result)
            callback(null, result)
        });
    },

    _get: function (id, callback) {
        // console.log('[_get] Got called')
        var entry;
        var self = this;
        memcached.get(id, function (err, result) {
            if (err) {
                logger.error(util.inspect(err));
            } else {
                entry       = result;
                entry.atime = Date.now();

                if (self.options.raw) {
                    callback(null, entry.document);
                } else {
                    // If the document is already wrapped in a `Response`,
                    // just return it. Else, wrap it first. We clone the documents
                    // before returning them, to protect them from modification.
                    if (typeof entry.document !== "undefined") {
                        if (entry.document.toJSON) {
                            callback(null, clone(entry.document));
                        } else {
                            callback(null, new(Response)(clone(entry.document)));
                        }
                    } else {
                        callback(null, entry.document);
                    }
                }
            }
        });
    },
    _has: function (id, callback) {
        // async.waterfall([
        //     function (nextStep) {
        //         memcached.get(id, nextStep);
        //     },
        //     function (result, nextStep) {
        //         var exist = false;
        //         if (result !== false) {
        //             exist = true
        //         }
        //         callback(null, exist)
        //     }
        // ]);
        memcached.get(id, function (err, result) {
            if (err) {
                logger.error(util.inspect(err))
                callback(null, false)
            } else {
                callback(null, true)
            }
        });
    },
    _save: function (id, doc) {
        memcached.set(id, { atime: Date.now(), document: doc  }, 100000, function (err, result) {
            if (err) logger.error(util.inspect(err));
        });
        // memcached.del(id, function (err, result) {
        //     if (err) {
        //         logger.error(util.inspect(err))
        //     } else {
        //         memcached.set(id, { atime: Date.now(), document: doc  }, 10000, function (err, result) {
        //             if (err) logger.error(util.inspect(err));
        //         });
        //     }

        // });

    },
    _purge: function (id) {
        memcached.del(id, function (err, result) {
            if (err) {
                logger.error(util.inspect(err))
            }
        });
    },
    query: function (op, id, doc, callback) {
        if (this.options.cache) {
            if (op == 'has') {
                this._has(id, function (err, result) {
                    if (err) logger.error(util.inspect(err));
                    callback(null, result)
                });
            } else if (op == 'get') {
                this._get(id, function (err, result) {
                   if (err) {
                        logger.error(util.inspect(err));
                        callback(err)
                    } else {
                        if(typeof result === "undefined") {
                            callback("not found")
                        } else {
                            callback(null, result)
                        }
                    }
                })
            } else {
                return this['_' + op](id, doc);
            }

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
