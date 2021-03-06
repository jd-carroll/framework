'use strict';

var Jsdom = require('jsdom');
var Lodash = require('lodash');

var BuildHelpers = require('./../build-helpers/build-helpers');
var EsprimaHelpers = require('./../esprima-helpers/esprima-helpers');

var Config = require('./../config');

var QUOTE = '\'';
var EXTENDS_KEY = 'extends';

var nativeElmementsRegex = /^(a|abbr|acronym|address|applet|area|article|aside|audio|b|base|basefont|bdi|bdo|bgsound|big|blink|blockquote|body|br|button|canvas|caption|center|cite|code|col|colgroup|content|data|datalist|dd|decorator|del|details|dfn|dir|div|dl|dt|element|em|embed|fieldset|figcaption|figure|font|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hgroup|hr|html|i|iframe|img|input|ins|isindex|kbd|keygen|label|legend|li|link|listing|main|map|mark|marquee|menu|menuitem|meta|meter|nav|nobr|noframes|noscript|object|ol|optgroup|option|output|p|param|plaintext|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|shadow|small|source|spacer|span|strike|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|tt|u|ul|var|video|wbr|xmp)$/gi;

function fixChildNode(node, tree, imports, doc) {
    fixTree(node, imports, doc);

    var lowercaseTagName = node.tagName.toLowerCase();
    var isNativeTag = !!lowercaseTagName.match(nativeElmementsRegex);

    if (!isNativeTag) {
        var newTagName = imports[lowercaseTagName] || node.tagName;
        var newNode = doc.createElement(newTagName);

        newNode.innerHTML = node.innerHTML;

        for (var i = 0; i < node.attributes.length; i++) {
            var attr = node.attributes[i];
            newNode.setAttribute(attr.nodeName, attr.nodeValue);
        }

        tree.replaceChild(newNode, node);
    }
}

function fixTree(tree, imports, doc) {
    for (var i = 0; i < tree.children.length; i++) {
        fixChildNode(tree.children[i], tree, imports, doc);
    }

    return tree.innerHTML;
}

function expandObjectKeyShorthands(facetName, facetObj, imports, depth) {
    EsprimaHelpers.eachObjectProperty(facetObj, function(keyName, _2, _3, valueObj, property) {
        if (EsprimaHelpers.isObjectExpression(valueObj)) {
            expandObjectKeyShorthands(facetName, valueObj, imports, depth + 1);
        }

        // Since so-called "direct targeted behaviors" aren't currently supported --
        // i.e. behaviors that bypass the normal eventing conduit via a syntax such
        // as 'famous:foo:bar:behavior-blah' -- we don't do the imports conversion
        // here since it will raise an error on the client anyway.
        if (facetName !== Config.get('behaviorsFacetKeyName') || depth < 2) {
            for (var importNamespace in imports) {
                var importItems = imports[importNamespace];
                for (var i = 0; i < importItems.length; i++) {
                    var importItem = importItems[i];
                    if (keyName === importItem) {
                        var newKey = BuildHelpers.moduleNamespaceAndBasenameToModuleName(importNamespace, importItem);
                        property.key.value = newKey;
                        property.key.raw = QUOTE + newKey + QUOTE;
                    }
                }
            }
        }
    });
}

function expandExtendsShorthand(facetArray, imports) {
    EsprimaHelpers.eachArrayElement(facetArray, function(elementValue, elementObject){
        for (var importNamespace in imports) {
            var importItems = imports[importNamespace];
            for (var i = 0; i < importItems.length; i++) {
                if (importItems[i] === elementValue) {
                    var expandedExtends = BuildHelpers.moduleNamespaceAndBasenameToModuleName(importNamespace, elementValue);
                    elementObject.value = expandedExtends;
                    elementObject.raw = QUOTE + expandedExtends + QUOTE;
                }
            }
        }
    });
}

function expandImportsShorthand(info, cb) {
    for (var moduleName in info.moduleDefinitionASTs) {
        var moduleDefinitionAST = info.moduleDefinitionASTs[moduleName];
        var moduleConfigAST = info.moduleConfigASTs[moduleName];

        // Step 1: Get a simplified (complete) imports object.
        var configObject = EsprimaHelpers.getObjectValue(moduleConfigAST || { properties: [] });
        var imports = Lodash.defaults(configObject[Config.get('importsKeyName')] || {}, Config.get('defaultImports'));

        // Step 2: Replace shorthand references in the object keys
        var treeNode;
        EsprimaHelpers.eachObjectProperty(moduleDefinitionAST, function(facetName, _1, _2, valueObj) {
            if (facetName === Config.get('treeFacetKeyName')) {
                treeNode = valueObj;
            }
            else if (EsprimaHelpers.isObjectExpression(valueObj)) {
                // The last argument here is the depth, i.e. the depth within the object
                // behaviors: <~ depth 0
                //   selector: <~ depth 1
                //     behaviorName: <~ depth 2
                expandObjectKeyShorthands(facetName, valueObj, imports, 1); // <~ Recursive
            }
        });

        // Step 3: Expand the tree from shorthand to long-form.
        if (treeNode) {
            var virtualDOM = Jsdom.jsdom(treeNode.value);
            var doc = virtualDOM.defaultView.document;
            var flatImports = BuildHelpers.importsObjectToFlatImportsObject(imports);
            var newTree = fixTree(doc.body, flatImports, doc);
            treeNode.value = newTree;
        }

        // Step 4: Expand values in extends array from configuration object
        if (moduleConfigAST) {
            EsprimaHelpers.eachObjectProperty(info.moduleConfigASTs[moduleName], function(keyName, _1, _2, valueObj) {
                if (keyName === EXTENDS_KEY) {
                    expandExtendsShorthand(valueObj, imports);
                }
            });
        }
    }

    return cb(null, info);
}

module.exports = expandImportsShorthand;
