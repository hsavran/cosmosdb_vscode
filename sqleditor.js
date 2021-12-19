"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosmosEditorProvider = void 0;
var vscode = require("vscode");
var util_1 = require("./util");
/**
 * Provider for cat scratch editors.
 *
 * Cat scratch editors are used for `.cscratch` files, which are just json files.
 * To get started, run this extension and open an empty `.cscratch` file in VS Code.
 *
 * This provider demonstrates:
 *
 * - Setting up the initial webview for a custom editor.
 * - Loading scripts and styles in a custom editor.
 * - Synchronizing changes between a text document and a custom editor.
 */
var CosmosEditorProvider = /** @class */ (function () {
    function CosmosEditorProvider(context) {
        this.context = context;
    }
    CosmosEditorProvider.register = function (context) {
        var provider = new CosmosEditorProvider(context);
        var providerRegistration = vscode.window.registerCustomEditorProvider(CosmosEditorProvider.viewType, provider);
        return providerRegistration;
    };
    /**
     * Called when our custom editor is opened.
     *
     *
     */
     CosmosEditorProvider.prototype.resolveCustomTextEditor = function (document, webviewPanel) {
        return __awaiter(this, void 0, Promise, function () {
            function updateWebview() {
                webviewPanel.webview.postMessage({
                    type: 'update',
                    text: document.getText(),
                });
            }
            var changeDocumentSubscription;
            var _this = this;
            return __generator(this, function () {
                // Setup initial content for the webview
                webviewPanel.webview.options = {
                    enableScripts: true,
                };
                webviewPanel.webview.html ="";
                // this.getHtmlForWebview(webviewPanel.webview);
                changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(function (e) {
                    if (e.document.uri.toString() === document.uri.toString()) {
                        updateWebview();
                    }
                });
                // Make sure we get rid of the listener when our editor is closed.
                webviewPanel.onDidDispose(function () {
                    changeDocumentSubscription.dispose();
                });
                // Receive message from the webview.
                webviewPanel.webview.onDidReceiveMessage(function (e) {
                    switch (e.type) {
                        case 'add':
                            _this.addNewScratch(document);
                            return;
                        case 'delete':
                            _this.deleteScratch(document, e.id);
                            return;
                    }
                });
                updateWebview();
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get the static html used for the editor webviews.
     */
     CosmosEditorProvider.prototype.getHtmlForWebview = function (webview) {
        // Local path to script and css for the webview
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
</head>
<body>
<div style="background:gainsboro; padding: 5px 10px">
<input type="button" id="RunQuery" value="Execute"/>
 </div>
    <div style="background: white; width:100%; height: 100px;"></div>
	
</body>
</html>`;
    };
    /**
     * Add a new scratch to the current document.
     */
     CosmosEditorProvider.prototype.addNewScratch = function (document) {
        var json = this.getDocumentAsJson(document);
        var character = CosmosEditorProvider.scratchCharacters[Math.floor(Math.random() * CosmosEditorProvider.scratchCharacters.length)];
        json.scratches = __spreadArrays((Array.isArray(json.scratches) ? json.scratches : []), [
            {
                id: util_1.getNonce(),
                text: character,
                created: Date.now(),
            }
        ]);
        return this.updateTextDocument(document, json);
    };
    /**
     * Delete an existing scratch from a document.
     */
     CosmosEditorProvider.prototype.deleteScratch = function (document, id) {
        var json = this.getDocumentAsJson(document);
        if (!Array.isArray(json.scratches)) {
            return;
        }
        json.scratches = json.scratches.filter(function (note) { return note.id !== id; });
        return this.updateTextDocument(document, json);
    };
    /**
     * Try to get a current document as json text.
     */
     CosmosEditorProvider.prototype.getDocumentAsJson = function (document) {
        var text = document.getText();
        if (text.trim().length === 0) {
            return {};
        }
        try {
            return JSON.parse(text);
        }
        catch (_a) {
            throw new Error('Could not get document as json. Content is not valid json');
        }
    };
    /**
     * Write out the json to a given document.
     */
     CosmosEditorProvider.prototype.updateTextDocument = function (document, json) {
        var edit = new vscode.WorkspaceEdit();
        // Just replace the entire document every time for this example extension.
        // A more complete extension should compute minimal edits instead.
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(json, null, 2));
        return vscode.workspace.applyEdit(edit);
    };
    CosmosEditorProvider.viewType = 'cosmosdb.sqleditor';
    CosmosEditorProvider.scratchCharacters = ['😸', '😹', '😺', '😻', '😼', '😽', '😾', '🙀', '😿', '🐱'];
    return CosmosEditorProvider;
}());
exports.CosmosEditorProvider = CosmosEditorProvider;
