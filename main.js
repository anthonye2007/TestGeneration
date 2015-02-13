var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

}


function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		}
	}
};

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		var params = {};

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			//params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\''; // generates ''
		}

		//console.log( params );

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {mocking: 'fileWithContent' });
		var pathExists      = _.some(constraints, {mocking: 'fileExists' });

		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.value;
			}
		}

		// Prepare function arguments.
		// join parameters into string
		var args = joinArgs(params);
		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args);
		}
		else
		{
			content += generateNumericTestCases(funcName, params);
		}

	}


	fs.writeFileSync('test.js', content, "utf8");

}

function generateNumericTestCases(funcName, params) {
	function writeTest(paramsToWrite) {
		var args = joinArgs(paramsToWrite);
		testCase += "subject.{0}({1});\n".format(funcName, args);
	}

	var testCase = "";

	if (!params) {
		writeTest(params);
		return testCase;
	}

	for (identifier in params) {
		if (isNumeric(params[identifier])) {
			console.log("Numeric: -- " + identifier + " is: " + params[identifier]);
			// test for increased value
			var increasedValue = deepClone(params);
			increasedValue[identifier] = strToNum(increasedValue[identifier]);
			increasedValue[identifier] += 1;
			writeTest(increasedValue);

			// test for decreased value
			var decreasedValue = deepClone(params);
			decreasedValue[identifier] = strToNum(decreasedValue[identifier]);
			decreasedValue[identifier] -= 1;
			writeTest(decreasedValue);
		} else {
			console.log("Not numeric: -- " + identifier + " is: " + params[identifier]);

            if (params[identifier] === 'undefined') {
                console.log('undefined -- ' + identifier + " is: " + params[identifier]);
                var clone = deepClone(params);
                clone[identifier] = 'true';
                writeTest(clone);
            }
		}
	}	

	// test for same value
	writeTest(params);
	return testCase;
}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Insert mock data based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression')
				{
					if (child.operator == "==")
					{
						if( child.left.type == 'Identifier' && isParameter(params, child.left.name))
						{
							// get expression from original source code:
							//var expression = buf.substring(child.range[0], child.range[1]);
							var rightHand = buf.substring(child.right.range[0], child.right.range[1])
							functionConstraints[funcName].constraints.push( 
								{
									ident: child.left.name,
									value: rightHand
								});
						}
					}

					if (child.operator == '<')
					{
						if( child.left.type == 'Identifier' && isParameter(params, child.left.name))
						{
							var rightHand = buf.substring(child.right.range[0], child.right.range[1])
							functionConstraints[funcName].constraints.push( 
								{
									ident: child.left.name,
									value: rightHand
								});

							/*if (isNumeric(rightHand))
							{
								rightHand = strToNum(rightHand);

								// make expression true
								var decreaseValueToWithinRange = rightHand - 1;
								functionConstraints[funcName].constraints.push( 
									{
										ident: child.left.name,
										value: decreaseValueToWithinRange
									});

								// make expression false
								var increasedValue = rightHand + 1;
								functionConstraints[funcName].constraints.push( 
									{
										ident: child.left.name,
										value: increasedValue
									});
							}*/
						}
					}
				}

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'pathContent/file1'",
								mocking: 'fileWithContent'
							});
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'path/fileExists'",
								mocking: 'fileExists'
							});
						}
					}
				}

			});

			console.log( functionConstraints[funcName]);

		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}

function isParameter(params, toCheck) {
	return params.indexOf( toCheck ) > -1
}

function isNumeric(num){
    return !isNaN(num)
}

function strToNum(str) {
	return +str;
}

function joinArgs(params) {
	return Object.keys(params).map( function(k) {return params[k]; }).join(",");
}

function deepClone(obj) {
	// from http://stackoverflow.com/a/5344074/1212045
	return JSON.parse(JSON.stringify(obj));
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();
