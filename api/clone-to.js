
exports.for = function (API) {

	var exports = {};

	exports.PLFunction = function (sourceUri, targetPath) {

		function parseSourceUri (uri) {
			// git://git@github.com:sourcemint/sm.expand.git#<ref>(<branch>)
			var m = uri.match(/^git:\/\/(git@github\.com:[^\/]+\/.+?\.git)(#([^\()]*))?(\(([^\)]+)\))?$/);
			if (m) {
				return {
					origin: m[1],
					ref: m[3] || null,
					branch: m[4] || null
				};
			} else {
				throw new Error("Format for uri '" + uri + "' not supported!");
			}
		}

		var uriInfo = parseSourceUri(sourceUri);


		var origin = uriInfo.origin;
		// Turn into public URL
		//  git@github.com:firenode/firenode-for-jsonapi.git to
		//  https://github.com/amark/gun.git
		origin = origin.replace(/^git@github\.com:/, "https://github.com/");
		// TODO: Fall back to private URL if it fails.

		var commands = [
			"git clone " + origin + ' "' + API.PATH.basename(targetPath) + '"',
			'cd "' + API.PATH.basename(targetPath) + '"'
		];
		if (uriInfo.ref) {
			commands.push("git reset --hard " + uriInfo.ref);
		}
		commands = commands.concat([
			'if [ -f ".gitmodules" ]; then',
			'  git submodule update --init --recursive --rebase',
			'fi'
		]);

		return API.Q.denodeify(function (callback) {
			if (API.env.VERBOSE) {
				console.log("Running commands (cwd: " + API.PATH.dirname(targetPath) + "):", commands);
			}
		    var proc = API.SPAWN("bash", [
		        "-s"
		    ], {
		    	cwd: API.PATH.dirname(targetPath),
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
		        return callback(null);
		    });
		})();
	}

	return exports;
}
