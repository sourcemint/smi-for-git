
exports.for = function (API) {

	var exports = {};

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {


console.log("SPIN smi-for-git", "resolvedConfig", resolvedConfig);
		
			return resolvedConfig;
		});
	}

	exports.turn = function (resolvedConfig) {


console.log("TURN smi-for-git", "resolvedConfig", resolvedConfig);

		
	}

	return exports;
}

