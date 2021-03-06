var xhr = require('xhr');

var jsonFormatHelper = require('./formatHelpers/json');
var formatHelper = jsonFormatHelper;

var __xhrDebugLevel = 0;
var __xhrPooling = true;
var __xhrPoolSize = 0,
	__xhrPoolFree = [],
	__totalConcurrentXhr = 0,
	__maxConcurrentXhr = 5;

var cache = {};
function storeCache(url, data) {
	cache[url] = data;
}
function checkCache(url) {
	return !!cache[url];
}
function retreiveCache(url) {
	return cache[url];
}

function abortXhr(xhr) {
	if(__xhrDebugLevel >= 1) console.warn('Abort status.', xhr.readyState, xhr.status);
	if(xhr.readyState === 1 || xhr.readyState === 3) {
		if(__xhrDebugLevel >= 2) console.warn('Aborted.', xhr.url);
		xhr.abort();
	} else {
		if(__xhrDebugLevel >= 2) console.warn('Aborted before it started.', xhr.url);
		xhr.onload(new Error('Aborted before it started.'), null, xhr.url);
	}
}

function getXhrLoader(opt, onProgress, onComplete) {

	if (typeof opt === 'string')
		opt = { uri: opt };
	else if (!opt)
		opt = { };

	if(checkCache(opt.uri)) {
		setTimeout(function() {
			onProgress(1);
			onComplete(null, retreiveCache(opt.uri), opt.uri);
		}, 50);
		return null;
	}

	//if (!opt.headers)
	//	opt.headers = { 'Content-Type': opt.contentType };

	var jsonResponse = /^json$/i.test(opt.responseType);

	if(__xhrPooling && __xhrPoolFree.length > 0) {
		if(__xhrDebugLevel >= 2) console.log('XHR reusing pool for', opt.uri);
		opt.xhr = __xhrPoolFree.shift();
		// opt.xhr.responseType = opt.responseType || 'text';
		// cannot change responseType if xhr is Loading or Done...
		// have to rethink pooling when using different responseTypes
	} else {
		if(__xhrDebugLevel >= 2) console.log('XHR creating new for', opt.uri);
		if(__xhrPooling) __xhrPoolSize++;
	}
	function callbackHandler(err, res, body) {
		if(__xhrPooling) {
			if(__xhrDebugLevel >= 2) console.log('XHR return to pool', _xhr.url);
			__xhrPoolFree.push(_xhr);
		}
		__totalConcurrentXhr--;
		if (err) {
			if(__xhrDebugLevel >= 2) console.error('xhr error', _xhr.url);
			onComplete(err, null, _xhr.url);
			return;
		}
		if (!/^2/.test(res.statusCode)) {
			onComplete(new Error('http status code: ' + res.statusCode, _xhr.url));
			return;
		}

		if (jsonResponse) {
			onComplete(null, body, _xhr.url);
			storeCache(_xhr.url, body);
		} else {
			var data;
			try {
				data = opt.parser(body);
			} catch (e) {
				onComplete(new Error('cannot parse file: ' + e), null, _xhr.url);
			}
			if(data) {
				if(__xhrDebugLevel >= 2) console.log('xhr complete', _xhr.url);
				storeCache(_xhr.url, data);
				onComplete(null, data, _xhr.url);
			}
		}
	}

	var _xhr = xhr(opt, callbackHandler);
	_xhr.onprogress = onProgress;

	//hotfix
	_xhr.onreadystatechange = undefined;

	// _xhr.onabort = function() {
	// 	// callback(new Error('Aborted.'));
	// }
	__totalConcurrentXhr++;
	return _xhr;
}

function noop() {}

var nope = false;

var statuses = {
	IMPOSTER : -3,
	SHOULDNT_EVEN_EXIST : -2,
	LOAD_UNAVAILABLE : -1,
	LOAD_AVAILABLE : 0,
	LOADING : 1,
	LOADED : 2,
	LOAD_DEFERRED : 3
};

var loadResponses = {
	LOAD_UNAVAILABLE : -1,
	ALREADY_LOADED : 0,
	LOAD_STARTED : 1,
	ALREADY_LOADING : 2,
	LOAD_DEFERRED : 3
};

var __deferredLoadGeometryOf = [];

function JITGeometrySceneLoader(props) {
	if(props) this.load(props);
}

function deferLoadGeometryOf(jitInstance, args) {
	var indexOfPreexistingDeferredObject = -1;
	var deferredLoad = {
		jitInstance: jitInstance,
		args: args
	};

	for (var i = 0; i < __deferredLoadGeometryOf.length; i++) {
		var oldDeferredLoad = __deferredLoadGeometryOf[i];
		if(oldDeferredLoad.args[0].geometryName === args[0].geometryName) {
			indexOfPreexistingDeferredObject = i;
			break;
		}
	}
	if(indexOfPreexistingDeferredObject === -1) {
		__deferredLoadGeometryOf.push(deferredLoad);
	} else {
		// __deferredLoadGeometryOf.push(deferredLoad);
		__deferredLoadGeometryOf.splice(indexOfPreexistingDeferredObject, 0, deferredLoad);
	}
}

function cancelDeferredLoadGeometryOf(object) {
	var index = -1;
	for (var i = 0, len = __deferredLoadGeometryOf.length; i < len; i++) {
		if(object === __deferredLoadGeometryOf[i].args[0]) {
			index = i;
			break;
		}
	}
	if(index !== -1) {
		console.log('deferred object cancelled', object.name);
		__deferredLoadGeometryOf.splice(index, 1);
	} else {
		console.warn('deferred object was already cancelled');
		// debugger;
	}
}

function attemptToLoadDeferredObjects() {
	if(__totalConcurrentXhr < __maxConcurrentXhr && __deferredLoadGeometryOf.length > 0) {
		var next = __deferredLoadGeometryOf.shift();
		// setTimeout(function() {
		if (next.jitInstance.debugLevel >= 2) {
			console.log('undeferring', next.args[0].name);
			console.log('deferred objects remaining', __deferredLoadGeometryOf.length);
		}
		// if(__deferredLoadGeometryOf.length === 2) debugger;
		JITGeometrySceneLoader.prototype.loadGeometryOf.apply(next.jitInstance, next.args);
		// }, 100);
	}
}

function disposeGeometry(geometry) {
	for ( var name in geometry.attributes ) {
		var attribute = geometry.attributes[ name ];
		delete attribute.array;
	}

	geometry.meshes.forEach(function(mesh){
		if(mesh.parent) {
			mesh.parent.remove(mesh);
		}
	});
	geometry.meshes.length = 0;
}

JITGeometrySceneLoader.prototype = {
	objectsByPath: undefined,
	geometries: undefined,
	meshesUsingGeometriesByGeometryPaths: undefined,
	objectsWaitingForGeometriesByGeometryPaths: undefined,
	loadersByGeometryPaths: undefined,
	load: function (props) {
		if(nope) return;
		var _this = this;
		props = props || {};

		//defaults
		var defaults = {
			path: '',
			geometryPath: '',
			targetParent: undefined,
			onMeshComplete: function(mesh) { if(_this.debugLevel>=1) console.log('MESH COMPLETE'); },
			extraGeometryStep: function(geometry, callback) { if(_this.debugLevel>=1) console.log('GEOMETRY COMPLETE'); callback(); },
			onMeshDestroy: function(mesh) { if(_this.debugLevel>=1) console.log('MESH DESTROYED'); },
			onComplete: function() { if(_this.debugLevel>=1) console.log('LOAD COMPLETE'); },
			onProgress: function(val) { if(_this.debugLevel>=1) console.log('LOAD PROGRESS:', val); },
			debugLevel: 0
		};

		if(this.initd) {
			var keys = Object.keys(this.meshesUsingGeometriesByGeometryPaths);
			keys.forEach(function(key){
				var parts = _this.meshesUsingGeometriesByGeometryPaths[key].slice();
				parts.forEach(function(part) {
					_this.unloadGeometryOf(part);
				});
			});
			var collection = [];
			this.root.traverse(function(obj) {
				collection.push(obj);
			});
			collection.forEach(function(obj){
				if(obj.geometry) {
					disposeGeometry(obj.geometry);
				}
				if(obj.parent) obj.parent.remove(obj);
			});
			collection.length = 0;

			keys = Object.keys(this.objectsByPath);
			keys.forEach(function(key) {
				delete _this.objectsByPath[key].geometry;
				delete _this.objectsByPath[key];
			});

		}
		for(var key in defaults) {
			this[key] = props[key] !== undefined ? props[key] : defaults[key];
		}

		this.setPath(this.path);
		if(!this.initd) {
			this.initd = true;
			this.objectsByPath = {};
			this.geometries = {};
			this.meshesUsingGeometriesByGeometryPaths = {};
			this.objectsWaitingForGeometriesByGeometryPaths = {};
			this.loadersByGeometryPaths = {};
			this.threeObjectJSONLoader = new THREE.ObjectLoader();
			this.hierarchyRecieved = this.hierarchyRecieved.bind(this);
			this.geometryRecieved = this.geometryRecieved.bind(this);
			this.showByName = this.showByName.bind(this);
			this.hideByName = this.hideByName.bind(this);
		}
		var url = this.pathBase + this.path;

		var sceneProgress = 0;
		function onProgress(event) {
			if(event.lengthComputable) {
				sceneProgress = event.loaded / event.total;
			} else {
				sceneProgress = (1 - (1 - sceneProgress) * 0.5);
			}
			_this.onProgress(sceneProgress);
		}

		var params = {
			uri: url + '.hierarchy.json',
			contentType: jsonFormatHelper.contentType,
			parser: jsonFormatHelper.parse,
		};
		if(jsonFormatHelper.responseType) params.responseType = jsonFormatHelper.responseType;
		var loader = getXhrLoader(params,
			onProgress,
			this.hierarchyRecieved
		);
	},

	setPath: function(path) {
		this.pathBase = path.substring(0, path.lastIndexOf('/')+1);
		this.path = this.pathCropBase(path);
	},

	hierarchyRecieved: function(err, jsonData, path) {
		if(nope) return;
		if(err) {
			throw err;
		}
		path = path.split('.hierarchy.json')[0];
		if(!this.root) {
			this.root = new THREE.Object3D();
		} else {
			var children = [];
			var _this = this;
			this.root.traverse(function(obj) {
				if(obj instanceof THREE.Mesh) {
					obj = _this.demoteMeshToObject(obj);
				}
				children.push(obj);
			});
			var index = children.indexOf(this.root);
			if(index !== -1) {
				children.splice(index, 1);
			}
			children.forEach(function(obj) {
				if(obj.parent) obj.parent.remove(obj);
			});
		}
		for(var childName in jsonData) {
			this.root.add(this.createObject(jsonData[childName], path + '/' + childName));
		}
		if(this.targetParent) {
			this.targetParent.add(this.root);
		}
		if(this.onComplete) {
			this.onComplete();
			delete this.onComplete;
		}
	},

	geometryRecieved: function(err, data, path) {
		if(nope) return;
		delete this.loadersByGeometryPaths[path.split('.'+formatHelper.fileExt)[0]];
		if(this.debugLevel>=2) console.log('total loaders', Object.keys(this.loadersByGeometryPaths).length);

		if(err) {
			if(this.debugLevel>=1) console.warn(err);
		} else {
			path = this.pathCropGeometries(path);
			path = path.substring(0, path.lastIndexOf('.'+formatHelper.fileExt));
			// console.log(data);
			if(this.debugLevel>=2) console.log('loaded', path);

			var geometry = formatHelper.buildGeometry(data);
			geometry.name = path;
			var _this = this;
			this.extraGeometryStep(geometry, function() {
				if(_this.objectsWaitingForGeometriesByGeometryPaths[path]) {
					_this.meshesUsingGeometriesByGeometryPaths[path] = [];
					_this.integrateGeometry(geometry, path);
				} else {
					if(_this.debugLevel>=2) console.warn('No meshes to receive geomerty', path);
				}
			});
		}
		attemptToLoadDeferredObjects();
	},

	integrateGeometry: function(geometry, path) {
		if(this.debugLevel>=2) console.log('integrate geometry', path, this.objectsWaitingForGeometriesByGeometryPaths[path].length, this.meshesUsingGeometriesByGeometryPaths[path].length);
		this.geometries[path] = geometry;
		if(this.debugLevel>=2) console.log(Object.keys(this.geometries).length, 'geometries in memory');

		var objectsToPromote = this.objectsWaitingForGeometriesByGeometryPaths[path];
		var meshesUsingGeometry = this.meshesUsingGeometriesByGeometryPaths[path];
		for (var i = objectsToPromote.length - 1; i >= 0; i--) {
			var object = objectsToPromote[i];
			var mesh = this.promoteObjectToMesh(object, geometry);
			meshesUsingGeometry.push(mesh);
			// console.log('calling back?', mesh.path);
			if(object.geometryLoadCompleteCallback) {
				// if(i !== 0) debugger;
				// console.log('calling back', mesh.path);
				object.geometryLoadCompleteCallback();
				delete object.geometryLoadCompleteCallback;
			} else {
				// console.log('nope', mesh.path, 'out of', objectsToPromote.length);
			}
			// this.isolationTest(mesh);
		}
		delete this.objectsWaitingForGeometriesByGeometryPaths[path];
	},

	loadGeometryOf: function(object, progressCallback, callback) {
		if(nope) return;
		var loadStatus = object.loadStatus;
		if(loadStatus !== statuses.LOAD_AVAILABLE && loadStatus !== statuses.LOAD_DEFERRED) return false;
		// object.add(new THREE.Mesh(new THREE.SphereGeometry(10)));
		var geometryName = object.geometryName;
		var geometryPath = this.geometryPath + '/' + geometryName;
		if(this.debugLevel>=2) console.log('REQUEST', geometryName);
		switch(loadStatus) {
			// case statuses.LOAD_UNAVAILABLE:
			// 	break;
			case statuses.LOAD_AVAILABLE:
			case statuses.LOAD_DEFERRED:
				var geometry = this.geometries[geometryPath];
				if(geometry) {
					if(this.debugLevel>=2) console.log('reusing', geometryName);
					object = this.promoteObjectToMesh(object, geometry);
					this.meshesUsingGeometriesByGeometryPaths[geometryPath].push(object);
					if(object.geometryLoadCompleteCallback) {
						object.geometryLoadCompleteCallback();
					}
					if(this.debugLevel>=2) console.log('counting', geometryName, this.meshesUsingGeometriesByGeometryPaths[geometryPath].length);
					attemptToLoadDeferredObjects();
					return loadResponses.ALREADY_LOADED;
				} else if(this.objectsWaitingForGeometriesByGeometryPaths[geometryPath]) {
					if(this.debugLevel>=2) console.log('waiting for', geometryName);
					this.objectsWaitingForGeometriesByGeometryPaths[geometryPath].push(object);
					object.geometryLoadCompleteCallback = callback;
					object.loadStatus = statuses.LOADING;
					attemptToLoadDeferredObjects();
					return loadResponses.ALREADY_LOADING;
				} else if(__totalConcurrentXhr < __maxConcurrentXhr) {
					if(this.debugLevel>=2) console.log('loading', geometryName);
					object.geometryLoadCompleteCallback = callback;
					this.objectsWaitingForGeometriesByGeometryPaths[geometryPath] = [object];
					var params = {
						uri: geometryPath + '.' + formatHelper.fileExt,
						parser: formatHelper.parse,
						contentType: formatHelper.contentType,
						responseType: formatHelper.responseType
					};
					if(formatHelper.responseType) params.responseType = formatHelper.responseType;

					var loader = getXhrLoader(
						params,
						progressCallback,
						this.geometryRecieved
					);
					if(loader) {
						this.loadersByGeometryPaths[geometryPath] = loader;
						if(this.debugLevel>=2) console.log('total loaders', Object.keys(this.loadersByGeometryPaths).length);
					}
					object.loadStatus = statuses.LOADING;
					attemptToLoadDeferredObjects();
					return loadResponses.LOAD_STARTED;
				} else {
					if(this.debugLevel>=2) console.log('deferring', geometryName);
					object.geometryLoadCompleteCallback = callback;
					deferLoadGeometryOf(this, arguments);
					object.loadStatus = statuses.LOAD_DEFERRED;
					return loadResponses.LOAD_DEFERRED;
				}
				break;
			default:
				return loadResponses.LOAD_UNAVAILABLE;
		}
	},

	unloadGeometryOf: function(object) {
		if(nope) return;
		var loadStatus = object.loadStatus;
		if(loadStatus !== statuses.LOADED && loadStatus !== statuses.LOADING && loadStatus !== statuses.LOAD_DEFERRED && loadStatus !== statuses.IMPOSTER) return;
		var geometryName = object.geometryName;
		var geometryPath = this.geometryPath + '/' + geometryName;
		var index;
		if(this.debugLevel>=2) console.log('UNLOAD', geometryName);
		switch(loadStatus) {
			case statuses.IMPOSTER:
				if(this.debugLevel>=2) console.log('disposing imposter mesh', geometryName);
				if(object.parent) {
					object.parent.remove(object);
				}
				break;
			case statuses.LOADED:
				var geometry = this.geometries[geometryPath];
				if(this.debugLevel>=2) console.log('unloading', geometryName);
				var meshesUsingGeometry = this.meshesUsingGeometriesByGeometryPaths[geometryPath];
				if(!meshesUsingGeometry) {
					return;
				}
				index = meshesUsingGeometry.indexOf(object);
				meshesUsingGeometry.splice(index, 1);
				object = this.demoteMeshToObject(object, geometry);
				if(meshesUsingGeometry.length === 0) {
					if(this.debugLevel >= 2) console.log('disposing geometry', geometryName);
					disposeGeometry(geometry);
					delete this.meshesUsingGeometriesByGeometryPaths[geometryPath];
					delete this.geometries[geometryPath];
					if(this.debugLevel>=2) console.log(Object.keys(this.geometries).length, 'geometries in memory');
				} else {
					if(this.debugLevel >= 2) console.log('geometry', geometryName, 'still used in', meshesUsingGeometry.length, 'meshes');
				}
				object.loadStatus = statuses.LOAD_AVAILABLE;
				break;
			case statuses.LOAD_DEFERRED:
				if(this.debugLevel >= 2) console.log('cancelling deferred load of', geometryName);
				cancelDeferredLoadGeometryOf(object);
				object.loadStatus = statuses.LOAD_AVAILABLE;
				break;
			case statuses.LOADING:
				if(this.debugLevel >= 2) console.log('cancelling load of', geometryName);
				var objectsWaitingForGeometry = this.objectsWaitingForGeometriesByGeometryPaths[geometryPath];
				index = objectsWaitingForGeometry.indexOf(object);
				objectsWaitingForGeometry.splice(index, 1);
				if(this.debugLevel >= 2) {
					console.log('loading geometry', geometryName, 'still waited on by', objectsWaitingForGeometry.length, 'objects');
				}
				if(objectsWaitingForGeometry.length === 0) {
					delete this.objectsWaitingForGeometriesByGeometryPaths[geometryPath];
					var loader = this.loadersByGeometryPaths[geometryPath];
					if(loader) {
						if(this.debugLevel >= 2) console.log('aborting loader of', geometryName);
						abortXhr(loader);
						delete this.loadersByGeometryPaths[geometryPath];
					}
				}
				object.loadStatus = statuses.LOAD_AVAILABLE;
				break;
			// case statuses.LOAD_AVAILABLE:
			// 	break;
		}
	},

	storeObject: function(path, object) {

		//fix the alias for notFound
		var slices = path.split('/');
		if(slices[slices.length-1].indexOf('notFound') !== -1){
			slices[slices.length-1] = 'notFound';
		}
		path = slices.join('/');

		this.objectsByPath[path] = object;
	},

	createObject: function(jsonData, path) {
		var object = this.threeObjectJSONLoader.parseObject(jsonData);
		while(object.children.length > 0) object.remove(object.children[0]);	//I only want the object
		object.path = path;
		object.materialName = jsonData.material;
		this.storeObject(path, object);
		var name = path.substring(path.lastIndexOf('/')+1, path.length);
		object.name = name;

		for(var childName in jsonData.children) {
			object.add(this.createObject(jsonData.children[childName], path + '/' + childName));
		}

		var geometryName = jsonData.geometry;
		if(geometryName) {
			object.loadStatus = statuses.LOAD_AVAILABLE;
			object.geometryName = geometryName;
		} else {
			object.loadStatus = statuses.LOAD_UNAVAILABLE;
		}

		if(jsonData.quaternion) {
			object.quaternion.x = jsonData.quaternion[0];
			object.quaternion.y = jsonData.quaternion[1];
			object.quaternion.z = jsonData.quaternion[2];
			object.quaternion.w = jsonData.quaternion[3];
		}

		return object;
	},

	promoteObjectToMesh: function(object, geometry) {
		if(nope) return;
		var mesh = new THREE.Mesh(geometry);
		mesh.path = object.path;
		mesh.name = object.name;
		var parent = object.parent;
		object.loadStatus = statuses.SHOULDNT_EVEN_EXIST;
		mesh.loadStatus = statuses.LOADED;
		mesh.materialName = object.materialName;
		mesh.geometryName = object.geometryName;
		mesh.position.copy(object.position);
		mesh.scale.copy(object.scale);
		mesh.rotation.copy(object.rotation);
		mesh.visible = object.visible;
		if(parent) {
			parent.remove(object);
			parent.add(mesh);
		} else {
			nope = true;
			throw new Error('wtf');
		}

		mesh.updateMatrix();
		mesh.updateMatrixWorld();
		mesh.matrixAutoUpdate = object.matrixAutoUpdate;

		for (var i = object.children.length - 1; i >= 0; i--) {
			if(this.debugLevel >= 2) console.log('moving', object.children[i].path, 'to mesh');
			mesh.add(object.children[i]);
		}
		var path = object.path;
		this.storeObject(path, mesh);

		if(object === this.root) {
			this.root = mesh;
		}
		var _this = this;
		this.onMeshComplete(mesh);
		return mesh;
	},

	demoteMeshToObject: function(mesh) {
		if(nope) return;
		var object = new THREE.Object3D();
		object.path = mesh.path;
		object.name = mesh.name;
		var parent = mesh.parent;
		mesh.loadStatus = statuses.SHOULDNT_EVEN_EXIST;
		object.materialName = mesh.materialName;
		object.geometryName = mesh.geometryName;
		object.position.copy(mesh.position);
		object.scale.copy(mesh.scale);
		object.rotation.copy(mesh.rotation);
		object.visible = mesh.visible;
		if(parent) {
			parent.remove(mesh);
			parent.add(object);
		} else {
			// nope = true;
			// throw new Error('wtf');
		}

		mesh.updateMatrix();
		mesh.updateMatrixWorld();
		mesh.matrixAutoUpdate = object.matrixAutoUpdate;

		for (var i = mesh.children.length - 1; i >= 0; i--) {
			if(this.debugLevel >= 2) console.log('moving', mesh.children[i].path, 'to object');
			object.add(mesh.children[i]);
		}
		var path = mesh.path;
		this.storeObject(path, object);

		if(mesh === this.root) {
			this.root = object;
		}

		var _this = this;

		this.onMeshDestroy(mesh);
		return object;
	},

	pathCropBase: function(path) {
		return path.substring(this.pathBase.length, path.length);
	},

	pathCropGeometries: function(path) {
		return path.substring(this.geometryPath + '/'.length, path.length);
	},

	notFound: function(name) {
		console.log(name, 'does not exist');
		if(name) {
			var slices = name.split('/');
			slices[slices.length-1] = 'notFound';
			name = slices.join('/');
		} else {
			name = 'notFound';
		}
		return this.objectsByPath[this.path + '/' + name];
	},

	showByName: function(name, recursive, childrenOnly) {
		if(nope) return;
		this.setVisibilityByName(name, true, recursive, childrenOnly);
	},

	hideByName: function(name, recursive, childrenOnly) {
		if(nope) return;
		this.setVisibilityByName(name, false, recursive, childrenOnly);
	},

	setVisibilityByName: function(name, state, recursive, childrenOnly) {
		if(nope) return;
		var object = this.getObjectByName(name);
		if(!object) {
			object = this.notFound(name);
		}
		if(object) {
			if(!childrenOnly) {
				object.visible = state;
			}
			// if(state, console.log(name));
			if(recursive) {
				object.traverse(function(obj) {
					if(obj === object) return;
					obj.visible = state;
				});
			}
		}
	},

	loadByName: function(name, recursive, progressCallback, callback) {
		if(nope) return;

		var object = this.getObjectByName(name);
		var geometriesToLoadCount = 0;
		var geometriesLoadedCount = 0;
		var loading = 0;
		var _this = this;
		var progressOfEachGeometry = [];
		function reportProgress() {
			var aggregatedProgress = 0;
			progressOfEachGeometry.forEach(function(val){
				aggregatedProgress += val;
			});
			aggregatedProgress /= geometriesToLoadCount;
			if(progressCallback) {
				progressCallback(aggregatedProgress);
			}
			if(_this.debugLevel>=1) console.log('geometry loading progress:', aggregatedProgress);
		}
		function geometryLoadProgressCallback(whichUniqueGeometry, event) {
			if(event.lengthComputable) {
				progressOfEachGeometry[whichUniqueGeometry] = event.loaded / event.total * 0.99;
			} else {
				progressOfEachGeometry[whichUniqueGeometry] = event.loaded === 0 ? 0 : (1 - (1 - progressOfEachGeometry[whichUniqueGeometry]) * 0.5) * 0.99;
			}
			reportProgress();
		}
		function geometryLoadCompleteCallback(whichUniqueGeometry) {
			geometriesLoadedCount++;
			//courtesy progress
			progressOfEachGeometry[whichUniqueGeometry] = 1;
			reportProgress();

			if(_this.debugLevel>=1) console.log(name+'\'s geometry objects loaded:', geometriesLoadedCount + '/' + geometriesToLoadCount);
			if(geometriesToLoadCount === geometriesLoadedCount) {
				if(callback) {
					callback();
				}
			}
		}

		if(!object) {
			object = this.notFound(name);
		}

		function attemptToLoadGeometry(obj) {
			var loadResponse = _this.loadGeometryOf(
				obj,
				geometryLoadProgressCallback.bind(obj, geometriesToLoadCount),
				geometryLoadCompleteCallback.bind(obj, geometriesToLoadCount)
			);
			switch(loadResponse) {
				case loadResponses.LOAD_STARTED:
				case loadResponses.LOAD_DEFERRED:
				case loadResponses.ALREADY_LOADING:
					geometriesToLoadCount++;
					progressOfEachGeometry.push(0);
					break;
			}
		}

		if(object) {
			if(recursive) {
				var collection = [];
				object.traverse(function(obj) {
					collection.push(obj);
				});
				collection.forEach(function(obj){
					attemptToLoadGeometry(obj);
				});
			} else {
				attemptToLoadGeometry(object);
			}
			if(this.debugLevel>=1) console.log('geometries to load:', geometriesToLoadCount);
			if(geometriesToLoadCount === 0 && callback){
				callback();
			}
		}
	},

	unloadByName: function(name, recursive) {
		if(nope) return;
		var object = this.getObjectByName(name);
		var _this = this;

		if(object) {
			if(recursive) {
				var collection = [];
				object.traverse(function(obj) {
					collection.push(obj);
				});
				collection.forEach(function(obj){
					_this.unloadGeometryOf(obj);
				});
			} else {
				this.unloadGeometryOf(object);
			}
		}
	},

	checkIfLoadedByName: function(name, recursive) {
		if(nope) return;
		var object = this.getObjectByName(name);
		var loaded = object.loadStatus === statuses.LOADED || object.loadStatus === statuses.LOAD_UNAVAILABLE || object.loadStatus === statuses.IMPOSTER;
		var _this = this;
		if(loaded && recursive) {
			object.traverse(function(obj) {
				if(obj.loadStatus !== statuses.LOADED && obj.loadStatus !== statuses.LOAD_UNAVAILABLE && obj.loadStatus !== statuses.IMPOSTER) {
					if(_this.debugLevel > 0) {
						console.log('loaded?', obj.name, obj.loadStatus);
					}
					loaded = loaded && false;
				}
			});
		}
		return loaded;
	},

	getObjectByName: function(name) {
		if(nope) return;
		var objPath = this.pathBase + this.path + '/' + name;
		return this.objectsByPath[objPath];
	},

	getNameByPath: function(path) {
		if(nope) return;
		var objPath = this.pathBase + this.path + '/';
		return path.split(objPath)[1];
	}
};

JITGeometrySceneLoader.setMaxConcurrentXhr = function (val) {
	__maxConcurrentXhr = val;
};

JITGeometrySceneLoader.setXhrPooling = function (val) {
	__xhrPooling = val;
};

JITGeometrySceneLoader.setXhrDebugLevel = function (val) {
	__xhrDebugLevel = val;
};

JITGeometrySceneLoader.setFormatHelper = function (helper) {
	formatHelper = helper;
};

JITGeometrySceneLoader.setXhrModule = function(alt) {
	xhr = alt;
};

JITGeometrySceneLoader.statuses = statuses;

module.exports = JITGeometrySceneLoader;
