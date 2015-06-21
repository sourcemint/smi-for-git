

exports.for = function (API) {

	var exports = {};

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

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {

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

				function loadSubmoduleDeclarationsAndMappings (callback) {
					resolvedConfig.declaredMappings = {};

					return API.PACKAGE.fromFile(API.PATH.join(process.env.PGS_WORKSPACE_ROOT, ".pgs/package.json"), {}, function (err, packageDescriptor) {
						if (err) return callback(err);

//					return API.loadProgramDescriptor(function (err, programDescriptor) {
//						if (err) return callback(err);

						if (packageDescriptor._data.mappings) {

							var PGS_PACKAGES_DIRPATH = process.env.PGS_PACKAGES_DIRPATH;

							for (var alias in packageDescriptor._data.mappings) {

								var location = packageDescriptor._data.mappings[alias].location;

								if (/^\./.test(alias)) {
/*
									var location = programDescriptor._data.mappings[alias].location;
									if (!/^\//.test(location)) {
										location = API.PATH.join(packageDescriptor._path, "..", location);
									}
									location = API.PATH.relative(resolvedConfig.gitRootPath, location);
*/
									resolvedConfig.declaredMappings[alias] = {
										path: location
									};
								} else
								if (location.substring(0, PGS_PACKAGES_DIRPATH.length) === PGS_PACKAGES_DIRPATH) {
									resolvedConfig.declaredMappings["./../.deps" + location.substring(PGS_PACKAGES_DIRPATH.length)] = {
										path: location
									};
								}
							}
						}

						return callback(null);

/*
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
*/
					});
				}

				return API.Q.denodeify(loadExistingSubmodules)().then(function () {
					return API.Q.denodeify(loadSubmoduleDeclarationsAndMappings)();
				});

			}).then(function () {

//console.log("RESOLVE smi-for-git", "resolvedConfig", resolvedConfig);

//process.exit(1);

resolvedConfig.t = Date.now();

				return resolvedConfig;
			});
		});
	}

	exports.turn = function (resolvedConfig) {

//console.log("TURN smi-for-git", "resolvedConfig", resolvedConfig);

		if (
			!resolvedConfig.export ||
			!resolvedConfig.export.catalog
		) {
			return API.Q.resolve();
		}


		function getDescriptor () {

			return API.Q.denodeify(function (callback) {

				if (!API.FS.existsSync(API.getPINFProgramProtoDescriptorPath())) {
					return callback(null, null);
				}

				return API.loadPINFProgramProtoDescriptor(function (err, programDescriptor) {
					if (err) return callback(err);

					function relativize () {
						var configStr = JSON.stringify(programDescriptor._data);
						configStr = configStr.replace(new RegExp(API.ESCAPE_REGEXP_COMPONENT(API.PATH.dirname(API.getRootPath())), "g"), "{{__DIRNAME__}}");
						configStr = configStr.replace(new RegExp(API.ESCAPE_REGEXP_COMPONENT(process.env.PIO_PROFILE_KEY), "g"), "{{env.PIO_PROFILE_KEY}}");
						configStr = configStr.replace(new RegExp(API.ESCAPE_REGEXP_COMPONENT(process.env.PIO_PROFILE_PATH), "g"), "{{env.PIO_PROFILE_PATH}}");
						programDescriptor._data = JSON.parse(configStr);
					}

					relativize();

					return callback(null, {
						"provenance": programDescriptor._data.$provenance || null,
						"config": programDescriptor._data.config,
						"mappings": programDescriptor._data.mappings
					});
				});
			})();
		}


		function exportMappings (provenance, config, mappings) {

			var aliasedPackages = {};
			for (var alias in mappings) {
				if (
					mappings[alias].location &&
					!/\//.test(alias)
				) {
					aliasedPackages[API.FS.realpathSync(mappings[alias].location)] = alias;
				}
			}

			// TODO: Do this in resolve above once we have a singular unified way of loading
			//       the PGS package and PINF descriptors in resolve and then use them when turning.
			function getProvenances () {
				if (!provenance) return API.Q.resolve();
				return API.Q.denodeify(function (callback) {
					var provenances = {
						declaredMappings: {},
						extends: {}
					};
					var waitfor = API.WAITFOR.serial(function (err) {
						if (err) return callback(err);
						return callback(null, provenances);
					});
					for (var path in provenance) {
						waitfor(path, function (path, callback) {

							return findGitRoot(path, function (err, gitRoot) {
								if (err) return callback(err);
								if (!gitRoot) {
									return callback(new Error("No git root found for: " + path));
								}

								var extendsRelpath = API.PATH.relative(API.PATH.dirname(gitRoot), path);
								var depRelpath = ".deps/" + extendsRelpath.split("/").shift();
								if (!provenances.extends[extendsRelpath]) {
									provenances.extends[extendsRelpath] = {
										location: "{{__DIRNAME__}}/.deps/" + extendsRelpath
									};
								} else {
									return callback(new Error("Already declared (use unique containing project basenames for external mappings): " + extendsRelpath));
								}
								API.EXTEND(true, provenances.extends[extendsRelpath], provenance[path]);

								if (!provenances.declaredMappings["./../" + depRelpath]) {
									provenances.declaredMappings["./../" + depRelpath] = {
										path: gitRoot,
										install: false
									};
								} else
								if (provenances.declaredMappings["./../" + depRelpath].path !== gitRoot) {
									console.log("depRelpath", depRelpath);
									console.log("provenances.declaredMappings", provenances.declaredMappings);
									console.log("gitRoot", gitRoot);
									return callback(new Error("Already declared: " + extendsRelpath));
								}

								return callback(null);
							});
						});
					}
					return waitfor();
				})();
			}

			return getProvenances().then(function (provenances) {

				var commands =
					Object.keys(provenances.declaredMappings)
					.concat(Object.keys(resolvedConfig.declaredMappings))
					.map(function (alias) {

						var path = (
							(resolvedConfig.declaredMappings[alias] && resolvedConfig.declaredMappings[alias].path) ||
							provenances.declaredMappings[alias].path
						);

						return [
							'echo "[repository]"',
							'echo "' + alias + '"',
							'echo "' + API.FS.realpathSync(path) + '"',
							'pushd "' + path + '"',
							'echo "[repository.branch]"',
							'git branch',
							'echo "[repository.origin]"',
							'git remote show -n origin',
							'echo "[repository.log]"',
							'git log -n 1',
							'popd'
						].join(";");
					});

				return API.Q.denodeify(function (callback) {
					return API.runCommands(commands, function (err, stdout) {
						if (err) return callback(err);

						var expectedMappings = {};
						for (var name in resolvedConfig.declaredMappings) {
							expectedMappings[name] = true;
						}
						var mappings = {};
						var current = {
							alias: null,
							realpath: null,
							section: null
						};
						var lines = stdout.split("\n");
						var m = null;
						for (var i=0,l=lines.length ; i<l ; i++) {
							// section boundaries
							m = lines[i].match(/^\[repository(\.([^\]]+))?\]$/);
							if (m) {
								current.section = m[2] || "";
								continue;
							}
							// section content
							if (current.section === "") {
								current.alias = lines[i];
								i += 1;
								current.realpath = lines[i];
								i += 1;
								mappings[current.alias] = {
									realpath: current.realpath,
									path: lines[i].split(" ")[0],
									branch: null
								};
							} else
							if (current.section === "branch") {
								m = lines[i].match(/^\* ((\(detached from )?([^\)]+)(\))?)/);
								if (m) {
									if (m[1] === m[3]) {
										mappings[current.alias].branch = m[1];
									} else {
										mappings[current.alias].branch = false;
									}
								}
							} else
							if (current.section === "origin") {
								m = lines[i].match(/^\s*Fetch URL:\s*(.+)$/);
								if (m) {
									mappings[current.alias].origin = m[1];
								}
							} else
							if (current.section === "log") {
								m = lines[i].match(/^commit (.+)$/);
								if (m) {
									mappings[current.alias].ref = m[1];
								}
								m = lines[i].match(/^Date:\s*(.+)$/);
								if (m) {
									mappings[current.alias].date = new Date(m[1]).getTime();
								}
							}
						}

						var finalMappings = {};
						for (var name in mappings) {
							finalMappings[name] = {
								"location": mappings[name].origin + "#" + mappings[name].ref
							};
							if (mappings[name].branch !== false) {
								finalMappings[name].location += "(" + mappings[name].branch + ")";
							}
							if (aliasedPackages[mappings[name].realpath]) {
								finalMappings[aliasedPackages[mappings[name].realpath]] = {
									"location": "{{__DIRNAME__}}/" + name.replace(/^\.\/\.\.\//, ""),
									"install": false
								};
							}

							if (
								(
									!resolvedConfig.declaredMappings[name] ||
									resolvedConfig.declaredMappings[name].install !== true
								) &&
								provenances.declaredMappings[name] &&
								provenances.declaredMappings[name].install === false
							) {
								finalMappings[name].install = false;
							}
						}

						var descriptor = {
							"@extends": provenances.extends || {},
							"config": config,
							"mappings": finalMappings
						};

						if (API.FS.existsSync(resolvedConfig.export.catalog)) {
							descriptor = API.DEEPMERGE(
								JSON.parse(API.FS.readFileSync(resolvedConfig.export.catalog, "utf8")),
								descriptor
							);
						}

						return API.FS.outputFile(
							resolvedConfig.export.catalog,
							JSON.stringify(descriptor, null, 4),
							"utf8",
							callback
						);
					});
				})();
			});
		}

		return getDescriptor().then(function (descriptor) {
			if (!descriptor) return;

			return exportMappings(
				descriptor.provenance,
				descriptor.config,
				descriptor.mappings
			);
		});


/*
		function ensureMappings () {
			if (!resolvedConfig.gitRootPath) {
				return API.Q.resolve();
			}

			function ensureMapping (submodulePath) {
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

			return API.Q.all(Object.keys(resolvedConfig.declaredMappings).map(ensureMapping));
		}

		return ensureMappings();
*/

	}

	return exports;
}

