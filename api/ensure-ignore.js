
exports.for = function (API) {

	var exports = {};

	function findGitRealRoot (path) {
		return API.QFS.isDirectory(API.PATH.join(path, ".git")).then(function (isDirectory) {
			if (isDirectory) {
				return API.PATH.join(path, ".git");
			}
			return API.QFS.read(API.PATH.join(path, ".git")).then(function (pointer) {

console.log("pointer", pointer);
throw new Error("TODO: Implement");

			});
		});
	}

	exports.PLFunction = function (path, rules) {

		return findGitRealRoot(path).then(function (path) {

			var excludePath = API.PATH.join(path, "info/exclude");

			return API.QFS.read(excludePath).then(function (excludes) {

				rules.forEach(function (rule) {
					// TODO: Move to sourcemint lib.
					function ensureLineInBlob (line, blob) {
						if (!(new RegExp("^" + API.REGEXP_ESCAPE(line) + "$", "m")).test(blob)) {
							if (API.env.VERBOSE) {
								console.log("Inserting rule '" + line + "' into file '" + excludePath + "'");
							}
							blob = blob.replace(/\n\s*$/, "") + "\n" + line;
						}
						return blob;
					}
					excludes = ensureLineInBlob(rule, excludes);
				});
				return API.QFS.write(excludePath, excludes);
			});
		});
	}

	return exports;
}
