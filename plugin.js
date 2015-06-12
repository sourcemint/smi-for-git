

exports.for = function (API) {

	var exports = {};

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {

			function findGitRoot (path, callback) {
				if (API.FS.existsSync(API.PATH.join(path, ".git"))) {
					return callback(null, path);
				}
				var newPath = API.PATH.dirname(path);
				if (newPath === path) {
					return callback(new Error("No git root found!"));
				}
				return findGitRoot(newPath, callback);
			}

			function ensureGitRootPath (callback) {
				if (resolvedConfig.gitRootPath) {
					return callback(null);
				}
				return findGitRoot(API.getDeclaringRootPath(), function (err, path) {
					if (err) return callback(err);
					resolvedConfig.gitRootPath = path;
					return callback(null);
				});
			}

			return API.Q.denodeify(ensureGitRootPath)().then(function () {

				function loadExistingSubmodules (callback) {
					resolvedConfig.existingSubmodules = {};
					var path = API.PATH.join(resolvedConfig.gitRootPath, ".gitmodules");
					return API.FS.exists(path, function (exists) {
						if (!exists) return callback(null);
						return API.FS.readFile(path, "utf8", function (err, data) {
							if (err) return callback(err);
							var lines = data.split("\n");
							var currentSubmodule = null;
							function memoizeCurrentSubmodule () {
								if (!currentSubmodule) return;
								resolvedConfig.existingSubmodules[currentSubmodule.path] = {
									url: currentSubmodule.url
								};
							}
							for (var i=0, l=lines.length ; i<l ; i++) {
								var m = lines[i].match(/^\[submodule "([^"]+)"\]$/);
								if (m) {
									memoizeCurrentSubmodule();
									currentSubmodule = {};
								} else {
									m = lines[i].match(/^[\s*]([\S]+)\s*=\s*(.+)$/);
									if (m) {
										currentSubmodule[m[1]] = m[2];
									}
								}
							}
							memoizeCurrentSubmodule();
							return callback(null);
						});
					});
				}

				function loadSubmoduleDeclarations (callback) {
					resolvedConfig.declaredSubmodules = {};
					return API.loadProgramDescriptor(function (err, programDescriptor) {
						if (err) return callback(err);
						return programDescriptor.getBootPackageDescriptor().then(function (packageDescriptor) {
							if (!packageDescriptor._data.mappings) {
								return callback(null);
							}
							for (var name in packageDescriptor._data.mappings) {
								if (packageDescriptor._data.mappings[name].giturl) {
									var submodulePath = packageDescriptor._data.mappings[name].location;
									if (!/^\//.test(submodulePath)) {
										submodulePath = API.PATH.join(packageDescriptor._path, "..", submodulePath);
									}
									submodulePath = API.PATH.relative(resolvedConfig.gitRootPath, submodulePath);
									resolvedConfig.declaredSubmodules[submodulePath] = {
										url: packageDescriptor._data.mappings[name].giturl
									};
								}
							}
							return callback(null);
						}, callback);
					});
				}

				return API.Q.denodeify(loadExistingSubmodules)().then(function () {
					return API.Q.denodeify(loadSubmoduleDeclarations)();
				});

			}).then(function () {

//console.log("RESOLVE smi-for-git", "resolvedConfig", resolvedConfig);

//process.exit(1);

//resolvedConfig.t = Date.now();

				return resolvedConfig;
			});
		});
	}

	exports.turn = function (resolvedConfig) {

//console.log("TURN smi-for-git", "resolvedConfig", resolvedConfig);

		function ensureSubmodule (submodulePath) {
			if (resolvedConfig.existingSubmodules[submodulePath]) {
				API.console.verbose("Submodule '" + submodulePath + "' already declared!");
				return API.Q.resolve();
			}
			return API.Q.denodeify(function (callback) {

//console.log("PATH", API.PATH.join(resolvedConfig.gitRootPath, submodulePath));

				return API.FS.exists(API.PATH.join(resolvedConfig.gitRootPath, submodulePath), function (exists) {
					if (exists) {
						API.console.verbose("Submodule '" + submodulePath + "' already exists at '" + API.PATH.join(resolvedConfig.gitRootPath, submodulePath) + "'!");
						return callback(null);
					}

//console.log("TODO: create submodule", submodulePath);

//process.exit(1);


					return callback(null);
				});
			})();
		}

		return API.Q.all(Object.keys(resolvedConfig.declaredSubmodules).map(ensureSubmodule));		
	}

	return exports;
}

