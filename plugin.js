
exports.for = function (API) {

	var exports = {};

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {


console.log("RESOLVE smi-for-git", "resolvedConfig", resolvedConfig);


//process.exit(1);

resolvedConfig.t = Date.now();

			return resolvedConfig;
		});
	}

	exports.turn = function (resolvedConfig) {


console.log("TURN smi-for-git", "resolvedConfig", resolvedConfig);

		
	}

	return exports;
}

