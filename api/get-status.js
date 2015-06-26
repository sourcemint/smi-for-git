
exports.for = function (API) {

	var exports = {};

	function runCommands (commands) {
		return API.Q.denodeify(function (callback) {
			if (API.env.VERBOSE) {
				console.log("Running commands:", commands);
			}
		    var proc = API.SPAWN("bash", [
		        "-s"
		    ], {
		    	env: process.env
		    });
		    proc.on("error", function(err) {
		    	return callback(err);
		    });
		    var stdout = [];
		    var stderr = [];
		    proc.stdout.on('data', function (data) {
		    	stdout.push(data.toString());
				if (API.env.VERBOSE) process.stdout.write(data);
		    });
		    proc.stderr.on('data', function (data) {
		    	stderr.push(data.toString());
				if (API.env.VERBOSE) process.stderr.write(data);
		    });
		    proc.stdin.write(commands.join("\n"));
		    proc.stdin.end();
		    proc.on('close', function (code) {
		    	if (code) {
		    		var err = new Error("Commands exited with code: " + code);
		    		err.code = code;
		    		err.stdout = stdout;
		    		err.stderr = stderr;
		    		console.error("err", err);
		    		return callback(err);
		    	}
		        return callback(null, stdout.join(""));
		    });
		})();
	}

	exports.PLFunction = function (paths) {

		// TODO: Use pure nodejs solution for this.
		var commands = paths.map(function (path) {
			return [
				'echo "[repository]"',
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

		return runCommands(commands).then(function (stdout) {
			var info = {};
			var current = {
				path: null,
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
					current.realpath = lines[i];
					i += 1;
					current.path = lines[i].split(" ")[0];
					info[current.path] = {
						realpath: current.realpath,
						path: current.path,
						branch: null
					};
				} else
				if (current.section === "branch") {
					m = lines[i].match(/^\* ((\(detached from )?([^\)]+)(\))?)/);
					if (m) {
						if (m[1] === m[3]) {
							info[current.path].branch = m[1];
						} else {
							info[current.path].branch = false;
						}
					}
				} else
				if (current.section === "origin") {
					m = lines[i].match(/^\s*Fetch URL:\s*(.+)$/);
					if (m) {
						info[current.path].origin = m[1];
					}
				} else
				if (current.section === "log") {
					m = lines[i].match(/^commit (.+)$/);
					if (m) {
						info[current.path].ref = m[1];
					}
					m = lines[i].match(/^Date:\s*(.+)$/);
					if (m) {
						info[current.path].date = new Date(m[1]).getTime();
					}
				}
			}
			return info;
		});
	}

	return exports;
}
