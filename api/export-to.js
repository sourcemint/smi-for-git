
exports.for = function (API) {

	var exports = {};

	exports.PLFunction = function (sourcePath, targetPath, options) {

		options = options || {};

		var commands = [
			'git archive master | tar -x -C "' + targetPath + '"'
		];

		return API.Q.denodeify(function (callback) {
			if (API.env.VERBOSE) {
				console.log("Running commands (cwd: " + sourcePath + "):", commands);
			}
		    var proc = API.SPAWN("bash", [
		        "-s"
		    ], {
		    	cwd: sourcePath,
		    	env: process.env
		    });
		    proc.on("error", function(err) {
		    	return callback(err);
		    });
		    var stdout = [];
		    var stderr = [];
		    proc.stdout.on('data', function (data) {
		    	stdout.push(data.toString());
				if (API.env.VERBOSE || options.showProgress) process.stdout.write(data);
		    });
		    proc.stderr.on('data', function (data) {
		    	stderr.push(data.toString());
				if (API.env.VERBOSE || options.showProgress) process.stderr.write(data);
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
