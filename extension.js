const vscode = require('vscode');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');
const { CosmosDBManagementClient } = require("@azure/arm-cosmosdb");
const { useIdentityPlugin, DefaultAzureCredential } = require("@azure/identity");
const { vsCodePlugin } = require("@azure/identity-vscode");
useIdentityPlugin(vsCodePlugin);
const { ResourceManagementClient } = require('@azure/arm-resources');
const { SubscriptionClient } = require("@azure/arm-subscriptions");
const cryptobase = require('crypto-js');
const cryptoJs = require('crypto-js');
const fetch = require('node-fetch');

var cosmosStudio = cosmosStudio || {
	panel: undefined,
	jslibs: [
		'webview1.js',
		'/node_modules/json-formatter-js/dist/json-formatter.umd.js',
		'/customJs/src-min-noconflict/ace.js',
		'/customJs/src-min-noconflict/mode-sql.js',
		'/customJs/src-min-noconflict/ext-language_tools.js',
		'node_modules/chart.js/dist/chart.min.js'],
	cssfiles:['webview.css'],
	creds : new DefaultAzureCredential(),	 
	subClient : null,
	cosmosClient:{},
	cosmosArmClient:{},
	resClient:{},	
	cosmosMaster:{},
	lastindexingmetrics:{
		db:'', container:'', queryhash:'', result:{}
	},
	pkeyranges: {
		dbname: null,
		container:null,
		partitions:undefined
	},
	myAzure :{
		subs:[],
		rgroups :[],
		accounts:[],
		dbs:[],
		cstring:[]
	},
	init: async function(){
		try
		{	
			await cosmosStudio.creds.getToken();
		}
		catch(ex){
			cosmosStudio.HandleErrorTxt(ex);
		}
		this.subClient = new SubscriptionClient(this.creds);
	},
};

cosmosStudio.GetSubscriptons = async function () {
	return cosmosStudio.subClient.subscriptions.list().then((result) => {
		cosmosStudio.myAzure.subs = result;
		return result;
	}).catch((err) => {	
		vscode.window.showErrorMessage(err.message);	  	
	  	return null;
	});
};

cosmosStudio.GetDatabaseAccounts = async function (){	
	return await cosmosStudio.cosmosArmClient.databaseAccounts.list().then((result) => {
		cosmosStudio.myAzure.accounts.push(result);		
		return result;
	  }).catch((err) => {		
		console.error(err);
		return null;
	  });
};

cosmosStudio.GetResourceGroups = async function(){	
	return cosmosStudio.resClient.resourceGroups.list().then((result) => {
		cosmosStudio.myAzure.rgroups.push(result);	  
		return result;
	}).catch((err) => {		
		console.error(err);
		return null;
	  });
};

cosmosStudio.GetConnectionString = async function(rgroup, dbacct){
	try{
	return cosmosStudio.cosmosArmClient.databaseAccounts.listConnectionStrings(rgroup,dbacct.name).then((cstr)=>{
		cosmosStudio.myAzure.cstring.push(cstr);
		var temp = cstr.connectionStrings.filter(function(a){return a.description == "Primary Read-Only SQL Connection String"});
		return temp[0];
	});
}
catch(ex){
	console.log(ex);
}
};

cosmosStudio.CreateConnection = function(cstring){	
		cosmosStudio.cosmosClient = new CosmosClient(cstring);	
};

cosmosStudio.DiscoverDatabases = async function(subid,rgroup, account){	
	return await cosmosStudio.cosmosArmClient.sqlResources.listSqlDatabases(rgroup,account.name).then((result)=>{
		cosmosStudio.panel.webview.postMessage({command:'dbCount', jsonData: result.length});
		for (var d=0; d<result.length; d++){			
			var info = (({consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}) => ({ consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}))(account);
			info.name = result[d].name;
			cosmosStudio.panel.webview.postMessage({command:'addDb', jsonData: info});
			cosmosStudio.GetContainers(rgroup,account.name,result[d].name, subid, result[d].resource._rid);
		}		
		return result;		
	}).catch((err)=>{
		console.log(err);
		return null;
	});
};

cosmosStudio.GetContainers = async function(rgroup, account, dbname, subid){	
	cosmosStudio.cosmosArmClient.sqlResources.listSqlContainers(rgroup,account,dbname).then((result) =>{
		if (result.length > 0){
			cosmosStudio.panel.webview.postMessage({command:'contCount', jsonData: result.length});
			var dbarm = cosmosStudio.CreateAzureArmItem(subid, rgroup, account, dbname,[]);
			for (var c=0; c<result.length; c++){
				var cont = {
					container: result[c].name, 
						db: dbname, 
						pkey: result[c].resource.partitionKey.paths[0], 
						indexing: result[c].resource.indexingPolicy,
						conflict: result[c].resource.conflictResolutionPolicy.mode,
						ukey: 'Not Found'
				}
				if (result[c].resource.uniqueKeyPolicy != undefined){
					cont.ukey = result[c].resource.uniqueKeyPolicy.uniqueKeys[0].paths[0]
				} 			
				cosmosStudio.panel.webview.postMessage({
					command:'addCon', 
					jsonData: cont
				});
				dbarm.colls.push({name: result[c].name, pkey: result[c].resource.partitionKey.paths[0], indexing: result[c].resource.indexingPolicy});
				
			}
			cosmosStudio.cosmosMaster.push(dbarm);			
		}
	}).catch((err) => {
		console.log(err);
	});	
};

cosmosStudio.CreateAzureArmItem = function(subid, rgroup, account, dbname, colls){
	return {
		subscription: subid,
		resGrp: rgroup,
		dbAcct: account,
		dbName: dbname,
		colls: colls
		};
};

cosmosStudio.CreateNewDatabase = async function (name) {
	try{
		const {database} = await cosmosStudio.cosmosClient.databases.createIfNotExists({id: name});
		vscode.window.showInformationMessage(database.id + ' is created.');
		return database;
	}
	catch(error){
		vscode.window.showErrorMessage(error);
	}
};

cosmosStudio.GetDatabases = async function () {
	var requestOptions ={};
	requestOptions.populateQuotaInfo=true;
	var { resources} = await cosmosStudio.cosmosClient.databases.readAll().fetchAll();
	cosmosStudio.panel.webview.postMessage({command:'dbCount', jsonData: resources.length});
	for (var i=0; i<resources.length; i++){
		var info ={}; // = (({consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}) => ({ consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}))(account);
		info.name = resources[i].id;
		cosmosStudio.panel.webview.postMessage({command:'addDb', jsonData: info});		
		var temp = await cosmosStudio.cosmosClient.database(resources[i].id).containers.readAll({populateQuotaInfo:true}).fetchAll();		
		var containerList = temp.resources;		
		for (var c=0; c< containerList.length;c++){			
			cosmosStudio.panel.webview.postMessage({command:'contCount', jsonData: containerList.length});
			cosmosStudio.panel.webview.postMessage({command:'addCon', jsonData: {
				container: containerList[c].id, 
				db: resources[i].id, 
				pkey: containerList[c].partitionKey.paths[0], 
				indexing: containerList[c].indexingPolicy,
				conflict: containerList[c].conflictResolutionPolicy.mode
			}});
		}	
	}
};

cosmosStudio.ExecuteQuery = async function(dbname, containerid, query, options){
	var cosmosResponse = await cosmosStudio.CreateNewCosmosResponseObj();
	try{
		var indexingmetrics= null;
		if (options!=null && options.populateIndexingMetrics){
			indexingmetrics = await cosmosStudio.GetIndexMetrics(dbname, containerid, query);
		}	
		const container = cosmosStudio.cosmosClient.database(dbname).container(containerid);	
		const queryIterator = container.items.query(query, options);
		let count = 0;
		
		cosmosResponse.indexingMetrics = indexingmetrics;	
		while (queryIterator.hasMoreResults() && count <= 100000) {		
			const resources = await queryIterator.fetchNext();		
			cosmosResponse.charge += Number(resources.headers['x-ms-request-charge']);
			cosmosResponse.result = cosmosResponse.result.concat(resources.resources);		
			if (resources.queryMetrics){			
				for (const prop in resources.queryMetrics){				
					if (resources.queryMetrics[prop]){
						cosmosResponse.requests++;
						cosmosResponse.queryMetrics.push(resources.queryMetrics[prop]);
						cosmosResponse.qms.push(await cosmosStudio.CreateQueryMetrics(prop, resources.queryMetrics[prop]));					
					}
				}
			}
		}
		return await cosmosStudio.HandleQueryMetricsCalculation(cosmosResponse);	
	}
	catch(e){
		cosmosResponse.hasError = true;
		cosmosResponse.error = await cosmosStudio.HandleErrorTxt(e.message);		
		return cosmosResponse;
	}
};

cosmosStudio.GetIndexMetrics = async function(dbname, containername, query){
	var hashed = await cosmosStudio.HashIt(query);
	if (cosmosStudio.lastindexingmetrics.db == dbname && cosmosStudio.lastindexingmetrics.container == containername && cosmosStudio.lastindexingmetrics.result && cosmosStudio.lastindexingmetrics.queryhash == hashed){
		return cosmosStudio.lastindexingmetrics.result;
	} else {
		cosmosStudio.lastindexingmetrics.db = dbname;
		cosmosStudio.lastindexingmetrics.container = containername;
		cosmosStudio.lastindexingmetrics.queryhash = await cosmosStudio.HashIt(query);
	}	
	var q ={
		query:query,
		parameters:[]
	}	
	var dt = cosmosStudio.cosmosClient.database(dbname);
	var endpoint = dt.clientContext.cosmosClientOptions.endpoint;
	var key = dt.clientContext.cosmosClientOptions.key;
	var url = endpoint +"/dbs/" + dbname + "/colls/"+ containername + "/docs";
	var pkeyrange = null;
	if (cosmosStudio.pkeyranges.dbname == dbname && cosmosStudio.pkeyranges.container == containername && cosmosStudio.pkeyranges.partitions){
		pkeyrange = cosmosStudio.pkeyranges.partitions.PartitionKeyRanges[0].id;
	} else {
		await cosmosStudio.FindPhysicalPartitions(dbname, containername);
		pkeyrange = cosmosStudio.pkeyranges.partitions.PartitionKeyRanges[0].id;
	}
	cosmosStudio.lastindexingmetrics.result = "N/A";
	var response = await fetch(url,
		{
			method: 'POST',
			headers: await cosmosStudio.CreateRequiredHeadersforApi('POST', dbname, containername, key, true,pkeyrange),
			body: JSON.stringify(q)
		}); //.then(response=>response.json());
		//check the status to continue
		if (response.ok){
			var indexmetrics = response.headers.get('x-ms-cosmos-index-utilization');
			if (indexmetrics){
				var result = Buffer.from(indexmetrics,'base64').toString();
				cosmosStudio.lastindexingmetrics.result = JSON.parse(result);
			}
		}		
	return cosmosStudio.lastindexingmetrics.result
};

cosmosStudio.HashIt = function (value){	
	return value.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);	 
};

cosmosStudio.FindPhysicalPartitions = async function(dbname, containername){
	var dt = cosmosStudio.cosmosClient.database(dbname);
	var endpoint = dt.clientContext.cosmosClientOptions.endpoint;
	var key = dt.clientContext.cosmosClientOptions.key;
	var url = endpoint +"/dbs/" + dbname + "/colls/"+ containername + "/pkranges";
	cosmosStudio.pkeyranges.dbname = dbname;
	cosmosStudio.pkeyranges.container = containername;
	cosmosStudio.pkeyranges.partitions = await fetch(url,
	{
		method: 'GET',
		headers: await cosmosStudio.CreateRequiredHeadersforApi('GET', dbname, containername, key, false)		
	}).then(response=>response.json());
	return cosmosStudio.pkeyranges.partitions;
};

cosmosStudio.CreateRequiredHeadersforApi = async function(action, dbname, containername, key, forquery, pkeyrangeid){
	var now = new Date().toUTCString();	
	var rtype = "pkranges";
	if (forquery){
		var rtype = "docs";
	}
	var rid = "dbs/" + dbname + "/colls/" + containername;
	var text = (action || "").toLowerCase() + "\n" + (rtype || "").toLowerCase() + "\n" + (rid || "") + "\n" + now.toLowerCase() + "\n" + "" + "\n";
	var key = cryptoJs.enc.Base64.parse(key);
	var signature = cryptobase.HmacSHA256(text,key).toString(cryptoJs.enc.Base64);
	var MasterToken = "master";
	var TokenVersion = "1.0";
	var authToken = encodeURIComponent("type=" + MasterToken + "&ver=" + TokenVersion + "&sig=" + signature);	
	var headers = new fetch.Headers({
		'authorization':authToken,
		'x-ms-date':now,
		'x-ms-version':'2018-12-31'
		//'x-ms-cosmos-populateindexmetrics':true
	});	
	if (forquery){
		headers.append('Content-Type','application/query+json');
		headers.append('x-ms-documentdb-isquery', true);
		headers.append('x-ms-documentdb-query-enablecrosspartition',true);
		headers.append('x-ms-cosmos-populateindexmetrics',true);		
	} else{
		headers.append('Content-Type','application/json');
	}
	if (pkeyrangeid){
		headers.append('x-ms-documentdb-partitionkeyrangeid',pkeyrangeid);
	}
	return headers;
};

cosmosStudio.CreateNewCosmosResponseObj = async function(){
	return {
		result:[],
		queryMetrics:[],
		indexingMetrics: {},
		charge:0,
		count:0,
		hasError: false,
		error: '',
		requests:0,
		qms:[],
		qm:{
			partitionid: 0,
			numberofpartition:0,
			documentLoadTime:0,
			documentWriteTime:0,
			indexHitDocumentCount:0,
			indexHitRatio:0,
			indexHitLookupTime:0,
			outputDocumentCount:0,
			outputDocumentSize:0,
			queryPreparationTimes:{
				logicalPlanBuildTime:0,
				physicalPlanBuildTime:0,
				queryCompilationTime:0,
				queryOptimizationTime:0
			},
			retrievedDocumentCount:0,
			retrievedDocumentSize:0,
			runtimeExecutionTimes:{
				queryEngineExecutionTime:0,
				systemFunctionExecutionTime:0,
				userDefinedFunctionExecutionTime:0
			},
			totalQueryExecutionTime:0,
			vmExecutionTime:0,
			requestUnits:0
		}
	};
};

cosmosStudio.CreateQueryMetrics = async function(pid, qmetrics){
	return {
		partitionid :pid,
		documentLoadTime : qmetrics.documentLoadTime._ticks / 10000,
		documentWriteTime : qmetrics.documentWriteTime._ticks / 10000,
		indexHitDocumentCount : qmetrics.indexHitDocumentCount.toFixed(2),
		indexHitLookupTime : qmetrics.indexLookupTime._ticks / 10000,
		outputDocumentCount : qmetrics.outputDocumentCount,
		outputDocumentSize : await cosmosStudio.formatBytes(qmetrics.outputDocumentSize),		
		retrievedDocumentCount : qmetrics.retrievedDocumentCount,
		retrievedDocumentSize : await cosmosStudio.formatBytes(qmetrics.retrievedDocumentSize),		
		totalQueryExecutionTime : qmetrics.totalQueryExecutionTime._ticks/10000,
		vmExecutionTime : qmetrics.vmExecutionTime._ticks/10000,
		requestUnits: qmetrics.clientSideMetrics.requestCharge
	};
};

cosmosStudio.HandleQueryMetricsCalculation = async function(cosmosResponse){
	for (var q=0;q<cosmosResponse.queryMetrics.length; q++){
		if (cosmosResponse.queryMetrics[q])		{
		cosmosResponse.qm.documentLoadTime += cosmosResponse.queryMetrics[q].documentLoadTime._ticks / 10000;
		cosmosResponse.qm.documentWriteTime += cosmosResponse.queryMetrics[q].documentWriteTime._ticks / 10000;
		cosmosResponse.qm.indexHitDocumentCount += cosmosResponse.queryMetrics[q].indexHitDocumentCount;
		cosmosResponse.qm.indexHitLookupTime += cosmosResponse.queryMetrics[q].indexLookupTime._ticks / 10000;
		cosmosResponse.qm.outputDocumentCount += cosmosResponse.queryMetrics[q].outputDocumentCount;
		cosmosResponse.qm.outputDocumentSize += cosmosResponse.queryMetrics[q].outputDocumentSize;
		cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.logicalPlanBuildTime._ticks / 10000;
		cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.physicalPlanBuildTime._ticks /10000;
		cosmosResponse.qm.queryPreparationTimes.queryCompilationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryCompilationTime._ticks / 10000;
		cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryOptimizationTime._ticks / 10000;
		cosmosResponse.qm.retrievedDocumentCount += cosmosResponse.queryMetrics[q].retrievedDocumentCount;
		cosmosResponse.qm.retrievedDocumentSize += cosmosResponse.queryMetrics[q].retrievedDocumentSize;
		cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.queryEngineExecutionTime._ticks/10000;
		cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.systemFunctionExecutionTime._ticks/10000;
		cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.userDefinedFunctionExecutionTime._ticks/10000;
		cosmosResponse.qm.totalQueryExecutionTime += cosmosResponse.queryMetrics[q].totalQueryExecutionTime._ticks/10000;
		cosmosResponse.qm.vmExecutionTime += cosmosResponse.queryMetrics[q].vmExecutionTime._ticks/10000;
		}		
	}
	cosmosResponse.qm.indexHitDocumentCount = cosmosResponse.qm.indexHitDocumentCount.toFixed(2);
	cosmosResponse.qm.documentLoadTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.documentLoadTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.documentWriteTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.documentWriteTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.indexHitLookupTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.indexHitLookupTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.queryCompilationTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.queryPreparationTimes.queryCompilationTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime,cosmosResponse.queryMetrics.length);

	cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.totalQueryExecutionTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.totalQueryExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.vmExecutionTime = await cosmosStudio.TakeAverage(cosmosResponse.qm.vmExecutionTime,cosmosResponse.queryMetrics.length);

	cosmosResponse.qm.outputDocumentSize = await cosmosStudio.formatBytes(cosmosResponse.qm.outputDocumentSize);
	cosmosResponse.qm.retrievedDocumentSize = await cosmosStudio.formatBytes(cosmosResponse.qm.retrievedDocumentSize);
	cosmosResponse.count = cosmosResponse.result.length;
	cosmosResponse.qm.numberofpartition = cosmosResponse.queryMetrics.length;
	return cosmosResponse;
};

cosmosStudio.TakeAverage = async function(number, counter){
	if (number == 0){
		return 0;
	}
	return number / counter;
};

cosmosStudio.formatBytes = async function(bytes, decimals = 2) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const dm = decimals <0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB','GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k,i)).toFixed(dm))+ ' ' + sizes[i];
};

cosmosStudio.HandleErrorTxt = async function(message){
	try{
		var custom = message.replace("Message: ","");
		custom = custom.slice(0, custom.indexOf('\r'));
		return JSON.parse(custom);
	}
	catch (e){
		return message;
	}
};

cosmosStudio.PointRead = async function(dbname, containerid, pkey, id){
	const container = cosmosStudio.cosmosClient.database(dbname).container(containerid);	
	var isNumber = Number(pkey);
	var item = container.item(id,pkey);
	var resource = await item.read();
if (resource.statusCode = 404 && isNumber){
	item = container.item(id,isNumber);
	resource = await item.read();
}
	var cosmosResponse ={
		result:[resource.resource],
		charge:resource.requestCharge,
		count:1
	};
	return cosmosResponse;
};

cosmosStudio.DeleteDocument = async function(dbname, containerid, pkey, docid){	
		const container = cosmosStudio.cosmosClient.database(dbname).container(containerid);
		var item;
		if (pkey == "Missing"){
			item = await container.item(docid, undefined);
		} else{
			item = await container.item(docid, pkey);
		}		
		var result = await item.delete();
		return {pkey: pkey, id:docid, status: result.statusCode, ru: result.requestCharge}	
};

async function activate(context) {
	cosmosStudio.init();
	context.subscriptions.push(
		vscode.commands.registerCommand('cosmosdb.openEditor', () => {
			const columnToShownIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;
			if (cosmosStudio.panel){
				cosmosStudio.panel.reveal(columnToShownIn);
			} else{
				cosmosStudio.panel = vscode.window.createWebviewPanel(
					'CosmosEditor', 
					'Cosmos DB Studio', 
					vscode.ViewColumn.One,
					{
						enableScripts: true,
						retainContextWhenHidden:true
					});
				}
				var jslocs = [];
				cosmosStudio.jslibs.forEach((jslib)=>{ 
					var loc = vscode.Uri.file(path.join(context.extensionPath,jslib));
					var scr = '<script src="'+ cosmosStudio.panel.webview.asWebviewUri(loc)+'"></script>';
					jslocs.push(scr);
				});				

				const css1 = vscode.Uri.file(
					path.join(context.extensionPath,'webview.css')
				);
				var cssloc = cosmosStudio.panel.webview.asWebviewUri(css1);				

				cosmosStudio.panel.webview.html = getWebviewContent(jslocs, cssloc);

				cosmosStudio.panel.webview.onDidReceiveMessage(
					async message => {
						switch(message.command){
							case 'newdatabase':
								await cosmosStudio.CreateNewDatabase("FromVsCode2");
								break;
							case 'execute':
								var response = await cosmosStudio.ExecuteQuery(message.conf.db,message.conf.cont,message.conf.q, message.conf.options);
								cosmosStudio.panel.webview.postMessage({command:'load', response:response});								
								break;
							case 'pointread':
								var response = await cosmosStudio.PointRead(message.conf.db, message.conf.cont, message.conf.pkey,message.conf.id);
								cosmosStudio.panel.webview.postMessage({command:'load', response:response});
								break;
							case 'listsubs':
								await cosmosStudio.GetSubscriptons().then((subs) =>{
									cosmosStudio.panel.webview.postMessage({command:'listsubs', jsonData: subs});
								});
								break;
							case 'init':								
								await cosmosStudio.GetSubscriptons().then((subs) =>{
									if (subs == null)	{
										vscode.window.showErrorMessage('Azure Token is expired. Try to open the Terminal and type az login to generate token.');
										cosmosStudio.panel.webview.postMessage({command:'openconnectionbox'});
									}																											
									if (subs != null  & subs.length > 0){		
										cosmosStudio.panel.webview.postMessage({command:'subCount', jsonData: subs.length});																		
										for (var s=0; s< subs.length; s++){
											var sid = subs[s].subscriptionId;
											cosmosStudio.cosmosArmClient = new CosmosDBManagementClient(cosmosStudio.creds, sid);												
											cosmosStudio.GetDatabaseAccounts(sid).then((dbacct)=>{
												cosmosStudio.panel.webview.postMessage({command:'accCount', jsonData: dbacct.length});												
												cosmosStudio.resClient = new ResourceManagementClient(cosmosStudio.creds, sid);
												cosmosStudio.GetResourceGroups(sid).then((resources) =>{
													cosmosStudio.panel.webview.postMessage({command:'resCount', jsonData: resources.length});
													for (var d=0; d<dbacct.length; d++){
														for (var g=0; g<resources.length; g++){	
															cosmosStudio.GetConnectionString(resources[g].name, dbacct[d]).then((cstring)=>{
																cosmosStudio.cosmosClient = new CosmosClient(cstring.connectionString);
															});
															cosmosStudio.DiscoverDatabases(sid,resources[g].name, dbacct[d]);
														}
													}
												});
											});
										}
									}
								}, reason =>{
									cosmosStudio.panel.webview.postMessage({command:"openconnectionbox", jsonData: reason});
									vscode.window.showErrorMessage(reason);
								});							
								break;
							case 'cstring':
								//cosmosStudio.cosmosClient = new CosmosClient(message.conn);
								cosmosStudio.CreateConnection(message.conn);
								cosmosStudio.GetDatabases();
								break;
							case 'findpartitions':
								var partitions = await cosmosStudio.FindPhysicalPartitions(message.conf.db, message.conf.cont);
								cosmosStudio.panel.webview.postMessage({command:"physicalpartitions", jsonData: partitions});
								break;

							case 'delete':
								var result = await cosmosStudio.DeleteDocument(message.db, message.container, message.pkey, message.docid);
								cosmosStudio.panel.webview.postMessage({command:"deleteresult", deleteresult: result});
						}
					},
					undefined,
					context.subscriptions
				);
			})
	);	
};

function getWebviewContent(jslist,css1){
	var scripts = "";
	jslist.forEach(element => {scripts = scripts.concat(element)});
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Cosmos DB SQL</title>
		<link rel="stylesheet" href='` + css1 +`'/>
		<link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
		integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
		crossorigin=""/>
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css" />
		` + scripts +`		
		<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"
   integrity="sha512-XQoYMqMTK8LvdxXYG3nZ448hOEQiglfqkJs1NOQV44cWnUrBc8PkAOcXy20w0vlaXaVUearIOBhiXZ5V3ynxwA=="
   crossorigin=""></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
	</head>
	<body>
        <div class="maingridcontainer">
            <div class="containergriditem connectcontainer">
                <div>
                    <label>Database : </label>
                    <select id="cosmosdblist">
                        <option value="-1">Select one</option>
                    </select>
                </div>
                <div>
                    <label>Container :</label>
                    <select id="cosmoscontainers"></select>					
					<input type="button" id="PartitionListButton" disabled='disabled' title="Select Database and Container to see the list of physical partitions" value="Partition List" class="commandbutton"/>
                </div>
                <div>					
                    <input type="button" id="QueryOptionsButton" value="Options" class="commandbutton"/>
                    <input type="button" id="RunQuery" value="Execute" class="commandbutton"/>					
                </div> 
                
            </div>
            <div class="containergriditem querycontainer">
				<div id="querysource" class='querysource'></div>
				<div class="queryoptionresults" style='height:100%'>
					<div id='PointReadBox' class='MetricsBox pointreadbox'>
						<div>
							<label id='cosmosdbpkeyname'>Partition Key :</label>
						</div>
						<div><input id='cosmosdbpkey' type="text"/></div>
						<div><label>Document Id<label></div>
						<div><input id='cosmosdbid' type="text"/></div>
						<div><input id='pointreadbutton' type="button" value="Point Read" class="commandbutton" /></div>
					</div>
				</div>
				<div class="MetricsTabs">
					<div class="metricstablink" id='PointReadLink' data-destination='PointReadBox'>
						<span>Point Read</span>
					</div>
				</div>
			</div>
            <div class="containergriditem summarycontainer">
                <div style="display:flex; align-items:center; "> 			        
                    <svg id="logo" style="width: 25px " viewBox="0 0 510.504 510.504" class="footerlogo" xmlns="http://www.w3.org/2000/svg"><g><g><path d="m255.504.252c-98.131 0-158.574 55.347-158.741 55.441-3.787 17.481-10.374 42.85-10.374 61.465 0 140.833 118.763 254.972 259.596 254.972 60.017 0 115.159-27.944 158.719-62.639.178-1.087 5.801-23.477 5.801-54.239-.001-140.833-114.169-255-255.001-255z" fill="black"/><path d="m345.963 364.931c-140.833 0-255-114.167-255-255 0-18.615 2.013-36.757 5.801-54.239-.006.005-.011.01-.017.014-58.646 46.721-96.243 118.738-96.243 199.546 0 104.501 62.86 194.32 152.832 233.708l14.049-.266 11.895 9.97c24.07 7.53 49.673 11.588 76.225 11.588 64.87 0 124.517-24.357 169.79-64.757l59.311-78.143c8.886-18.141 15.693-37.527 20.099-57.862-43.561 34.696-98.726 55.441-158.742 55.441z" fill="black"/></g><g><path d="m403.824 178.498 80.769 44.341h-36.826l-27.392-13.117z" fill="black"/><path d="m403.824 178.498 43.943 44.341h-22.096z" fill="#ffa50a"/><path d="m229.151 100.013-56.669 65.102 36.469 17.885 109.702-17.885-50.164-65.102z" fill="#ffc305"/><path d="m487.941 325.953-15.14-26.908-39.662 18.257-32.891 53.766 25.047 74.427c24.439-21.809 44.689-48.292 59.311-78.143z" fill="#2896ff"/><path d="m459.149 274.783 13.652 24.262-72.554 72.023z" fill="#1e87dc"/><path d="m400.247 371.068 67.815-91.174-64.238-101.396h-85.862z" fill="#ff3c3c"/><path d="m318.653 165.115 81.594 205.953-144.193 5.063 12.284-73.381z" fill="#ffa50a"/><path d="m318.653 165.115-62.599 211.016-30.426 1.068z" fill="#fa870a"/><path d="m59.036 1.062-58.102 27.544-.934 28.781h47.531l18.019-21.169z" fill="#2896ff"/><path d="m59.036 1.062-11.505 56.325h30.203z" fill="#1e87dc"/><path d="m59.036 1.062 53.513 45.111 59.933 118.942-6.586 213.537-100.636-103.96z" fill="#64bc0f"/><path d="m153.335 488.96c8.42 3.686 17.078 6.93 25.944 9.704l139.374-333.548h-146.171z" fill="#6e64c3"/></g></g></svg>
                    <label class="headertxt">SavranWeb</label>
                </div>
                <article>
                    <label>Request Charge : </label>
                    <span id="queryrequnit">0.0</span>
                </article>
                <article>
                    <label># Items : </label>
                    <span id="queryitemcount">0</span>
                </article>
            </div>
			<div class="containsergriditem containertablinks">
				<div class='tablink selectedtablink' data-destination='queryresults'>Results</div>
				<div class='tablink' data-destination='indexingresults' id='IndexingMetricstablink' style='display:none'>Indexing Metrics</div>
				<div class='tablink' data-destination='spatialresults'>Map</div>
				<div class='tablink' data-destination='analyzeresults'>Data Analyzer</div>
				<div class='tablink' data-destination='qanalyzer'>Query Analyzer</div>
				<div id='deleteButton' style='background: whitesmoke;padding: 3px 5px;position: fixed;right: 120px;margin: 4px 0 0 0;border-radius: 3px;color: black;' data-flag='1'>Delete</div>
				<div id='darkmodeToggle' style='position:fixed; right:10px;color:black' class='toggle1 toggle1selected' data-flag='1'>Dark Mode</div>
			</div>
            <div id='bottomcontainer' class="containergriditem bottomcontainer">
                <div id="queryresults" class="queryresults resultsbox"></div>
				<div id="indexingresults" class="indexingresults resultsbox">
					<div class="indexingmetricsholder">
						<div class="indexingmetricssection">
							<label class="indexingmetricsmaintitle">Utilized Indexes</label>
							<div id="UtilizedIndexes"></div>
							<table>
								<thead>
									<tr>
										<td>Index Type</td>
										<td>Index Path</td>
										<td>Index Importance</td>
									</tr>
								</thead>
								<tbody id='UtilizedIndexesTable'>
								</tbody>
							</table>
						</div>
						<div class="indexingseperator"></div>
						<div class="indexingmetricssection">
							<label class="indexingmetricsmaintitle">Potential Indexes</label>
							<div id="PotentialIndexes"></div>
							<table>
								<thead>
									<tr>
										<td>Index Type</td>
										<td>Index Path</td>
										<td>Index Importance</td>
									</tr>
								</thead>
								<tbody id='PotentialIndexesTable'>
								</tbody>
							</table>
						</div>						
					</div>				
				</div>
				<div id="spatialresults" class="resultsbox spatialresults">
					<div id="cosmosmap" class="cosmosmap"></div>
				</div>
				<div id="analyzeresults" class="resultsbox analyzeresults">
					<div style="color:black">
						<div style="display:flex; justify-content: space-around; align-items:center; padding: 5px 0 0 0; text-align:center; background: linear-gradient(45deg, gainsboro, lightgray, gainsboro); border-bottom: 1px solid gray">
								<div>
									<div>Property to analyze</div>
									<div>
										<select id="schemalist" class="analyzeselect">
										<option>No Schema</option>
										</select>
									</div>
								</div>
								<div>
									<div>Timeline property</div>
									<div>
									<select id="timelineschemalist" class="analyzeselect">
									  <option>No Schema</option>
									</select></div>
								</div>
								<div style='display:flex; justify-content:space-around; color:black;align-items:center'>
									<div>
										<input id='barcharttype' checked='checked' type='radio' name='charttype' value='bar' onchange='cosmosStudioWeb.RenderChart()' style='vertical-align:middle'/>
										<label for='barcharttype' style='vertical-align:middle'>Bar Chart</label>
									</div>
									<div style='margin: 0 5px'>
										<input id='linecharttype' type='radio' name='charttype' value='line' onchange='cosmosStudioWeb.RenderChart()' style='vertical-align:middle'/>
										<label for='linecharttype' style='vertical-align:middle'>Line Chart</label>
									</div>
									<div>
										<input id='piechartype' type='radio' name='charttype' value='doughnut' onchange='cosmosStudioWeb.RenderChart()' style='vertical-align:middle'/>
										<label for='piechartype' style='vertical-align:middle'>Pie Chart</label>
									</div>
								</div>
						</div>
						
						<div id="analyzer1" class="canvasholder" style='background:white'>
							<canvas id='testchart' width='800' height='300'></canvas>
						</div>
						<div style="display:flex; justify-content:space-around; background: linear-gradient(45deg, gray, dimgray, gray,dimgray); padding: 3px 0; color:black">
							<div class="analyzestat"> Min : <span id="analyzemin">0</span></div>
							<div class="analyzestat"> Avg : <span id="analyzeavg">0</span></div>
							<div class="analyzestat"> Max : <span id="analyzemax">0</span></div>
						</div>
					</div>
				</div>
				<div id="qanalyzer" class="resultsbox qanalyzer">
					<div>
						<div class='QComparisonOptions'>
							<input id='QueryAnalyzerStatusButton' type='button' value='Start'/>							
							<input id='QueryAnalyzerClearButton' type='button' value='Clear'/>						
						</div>
						<div id="queriestoanalyze" class="queriestoanalyze">
						<div class='TrialQueryDefs'>
									<div>&nbsp</div>
									<div>Cost(R/U)</div>
									<div>Retrieved Docs</div>
									<div>Index Hit</div>									
									<div>Requests</div>
									<div>Max Item Count</div>
									<div>Index Lookup</div>
									<div>Index Suggestion</div>								
							</div>							
						</div>
						<div id='QueryComparison' class='QComparisonHolder'>
							<div class='QComparisonRow QComparisonRowHeader' >
								<div style='width:80%; text-align:center'>Query</div>
								<div style='width:20%; text-align:center'>Potential Indexes</div>
							</div>											
						</div>
					</div>					
				</div>				
		        <div id="queryoptionresults" class="queryoptionresults">
					<div id='OverallInformationBox' class='MetricsBox'>
						<div class='section1'>Container</div>
						<div class='sameline withborder'>
							<div>Partition Keys</div>
							<span id='partkeytxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Unique Key</div>
							<span id='uqkeytxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Conflict</div>
							<span id='conflicttxt'></span>
						</div>
						<div class='section1'>Database</div>
						<div class='sameline withborder'>
							<div>Region</div>
							<span id='regiontxt'></span>							
						</div>
						<div class='sameline withborder'>
							<div>Automatic Failover</div>
							<span id='failovertxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Consistency</div>
							<span id='consistencytxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Analytical Storage</div>
							<span id='analyticalstoragetxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Free Tier</div>
							<span id='freetiertxt'></span>
						</div>
						<div class='sameline withborder'>
							<div>Backup Type</div>
							<span id='backuptypetxt'></span>
						</div>
					</div>
                    <div id='IndexingPolicyBox' class='MetricsBox'>
                        <div class='sameline withborder'>			
                            <div>Mode</div>
                            <span id='indexingMode'></span>
                        </div>
						<div class="samegroup">
                            <div class="alignleft">Included Properties</div>
                            <div id="includedPaths" style='font-weight:bold'></div>
                        </div>
                        <div class="samegroup">
                            <div class="alignleft">Excluded Properties</div>
                            <div id="excludedPaths" style='font-weight:bold'></div>
                        </div>                        
						<div class="samegroup">
                            <div class="alignleft">Composite Properties</div>
                            <div id="compositePaths" style='font-weight:bold'></div>
                        </div>
                        <div class="samegroup">
                            <div class="alignleft">Spatial Indexes</div>
                            <div id="spatialIndexes" style='font-weight:bold'></div>
                        </div>
                    </div>
                    <div id='ExecutionMetricsBox' class='MetricsBox'>
                        	<div class='samegroup'>
								<div class='sameline'>			
								<div>Number of Requests</div>
								<span id='numberOfPartitions'></span>								
							</div>
                             <div class='sameline'>			
                                 <div>Retrieved Documents</div>
                                 <span id='retrievedDocumentCount'></span>
                             </div>
                             <div class='sameline'>
                                 <div>Size</div>
                                 <span id='retrievedDocumentSize'></span>
                             </div>
                         </div>
                         <div class='samegroup'>		   		
                             <div class='sameline'>			
                                 <div>Output Documents</div>
                                 <span id='outputDocumentCount'></span>
                             </div>
                             <div class='sameline'>
                                 <div>Size</div>
                                 <span id='outputDocumentSize'></span>
                             </div>
                         </div>		
                         <div class='sameline withborder'>
                             <div>Index Hit Documents :</div>	
                             <span id='indexHitDocumentCount'></span>			
                         </div>
                         <div class='samegroup'>		   		
                             <div class='sameline'>			
                                 <div>Query Execution</div>
                                 <span id='totalQueryExecutionTime'></span>
                             </div>
                             <div class='detailgroup'>
                                 <div class='section1'>Preparation </div>
                                 <div class='sameline'>			
                                     <div>Compilation</div>
                                     <span id='queryCompilationTime'></span>
                                 </div>
                                 <div class='sameline'>			
                                     <div>Logical Plan</div>
                                     <span id='logicalPlanBuildTime'></span>
                                 </div>
                                 <div class='sameline'>			
                                     <div>Physical</div>
                                     <span id='physicalPlanBuildTime'></span>
                                 </div>
                                 <div class='sameline'>			
                                     <div>Optimization</div>
                                     <span id='queryOptimizationTime'></span>
                                 </div>
                             </div>				
                             <div class='sameline'>			
                                 <div>Index Lookup</div>
                                 <span id='indexHitLookupTime'></span>
                             </div>
                             <div class='sameline'>			
                                 <div>Doc. Load Time</div>
                                 <span id='documentLoadTime'></span>
                             </div>
                             <div class='detailgroup'>
                                 Runtime Execution
                                 <div class='sameline'>			
                                     <div>Query Engine</div>
                                     <span id='queryEngineExecutionTime'></span>
                                 </div>
                                 <div class='sameline'>			
                                     <div>Sys Func Executon</div>
                                     <span id='systemFunctionExecutionTime'></span>
                                 </div>
                                 <div class='sameline'>			
                                     <div>UDF Execution</div>
                                     <span id='userDefinedFunctionExecutionTime'></span>
                                 </div>
                             </div>
                             <div class='sameline'>			
                                 <div>Write Time</div>
                                 <span id='documentWriteTime'></span>
                             </div>
                             <div class='sameline'>
                                 <div>vm Execution Time</div>
                                 <span id='vmExecutionTime'></span>
                         </div>
                         </div>                         
                 </div>
                </div>
                <div class='MetricsTabs'>
					<div class="metricstablink" id='OverallLink' data-destination='OverallInformationBox'>
                        <span>Overall Info</span>				
                    </div>
                    <div class="metricstablink" id='ExecutionMetricsLink' data-destination='ExecutionMetricsBox'>
                        <span>Execution Metrics</span>				
                    </div>
                    <div class="metricstablink" id='IndexinPolicyLink' data-destination='IndexingPolicyBox'>
                        <span>Indexing Policy</span>
                    </div>
                </div>                
            </div>
        </div>
    </body>	
    <dialog id='loadingbox' class="loadDialog">    
		<div style="padding:10px; display: flex; justify-content: space-around;align-items: center;">        
			<svg xmlns="http://www.w3.org/2000/svg" style="width:45px" viewBox="0 0 18 18"><defs><radialGradient id="a" cx="-105.006" cy="-10.409" r="5.954" gradientTransform="matrix(1.036 0 0 1.027 117.739 19.644)" gradientUnits="userSpaceOnUse"><stop offset=".183" stop-color="#5ea0ef"/><stop offset="1" stop-color="#0078d4"/></radialGradient><clipPath id="b"><path d="M14.969 7.53a6.137 6.137 0 11-7.395-4.543 6.137 6.137 0 017.395 4.543z" fill="none"/></clipPath></defs><path d="M2.954 5.266a.175.175 0 01-.176-.176A2.012 2.012 0 00.769 3.081a.176.176 0 01-.176-.175.176.176 0 01.176-.176A2.012 2.012 0 002.778.72a.175.175 0 01.176-.176.175.175 0 01.176.176 2.012 2.012 0 002.009 2.009.175.175 0 01.176.176.175.175 0 01-.176.176A2.011 2.011 0 003.13 5.09a.177.177 0 01-.176.176zM15.611 17.456a.141.141 0 01-.141-.141 1.609 1.609 0 00-1.607-1.607.141.141 0 01-.141-.14.141.141 0 01.141-.141 1.608 1.608 0 001.607-1.607.141.141 0 01.141-.141.141.141 0 01.141.141 1.608 1.608 0 001.607 1.607.141.141 0 110 .282 1.609 1.609 0 00-1.607 1.607.141.141 0 01-.141.14z" fill="#50e6ff"/><path d="M14.969 7.53a6.137 6.137 0 11-7.395-4.543 6.137 6.137 0 017.395 4.543z" fill="url(#a)"/><g clip-path="url(#b)" fill="#f2f2f2"><path d="M5.709 13.115a1.638 1.638 0 10.005-3.275 1.307 1.307 0 00.007-.14A1.651 1.651 0 004.06 8.064H2.832a6.251 6.251 0 001.595 5.051zM15.045 7.815c0-.015 0-.03-.007-.044a5.978 5.978 0 00-1.406-2.88 1.825 1.825 0 00-.289-.09 1.806 1.806 0 00-2.3 1.663 2 2 0 00-.2-.013 1.737 1.737 0 00-.581 3.374 1.451 1.451 0 00.541.1h2.03a13.453 13.453 0 002.212-2.11z"/></g><path d="M17.191 3.832c-.629-1.047-2.1-1.455-4.155-1.149a14.606 14.606 0 00-2.082.452 6.456 6.456 0 011.528.767c.241-.053.483-.116.715-.151a7.49 7.49 0 011.103-.089 2.188 2.188 0 011.959.725c.383.638.06 1.729-.886 3a16.723 16.723 0 01-4.749 4.051A16.758 16.758 0 014.8 13.7c-1.564.234-2.682 0-3.065-.636s-.06-1.73.886-2.995c.117-.157.146-.234.279-.392a6.252 6.252 0 01.026-1.63 11.552 11.552 0 00-1.17 1.372C.517 11.076.181 12.566.809 13.613a3.165 3.165 0 002.9 1.249 8.434 8.434 0 001.251-.1 17.855 17.855 0 006.219-2.4A17.808 17.808 0 0016.24 8.03c1.243-1.661 1.579-3.15.951-4.198z" fill="#50e6ff"/></svg>
			<label>Please wait,<br/> Retrieving Cosmos DB Information...</label>        
		</div>
		<div id='authError' style='font-size:12px;display:none; text-align:center; color:red'>
		Authentication Denied / Your IT Dep. might blocked this request. <br/>
			<ul style='text-align:left; font-size:11px'>
				<li>You need to have Azure Account extension for VSCode.</li>
				<li>Your Azure account might not have rights to complete this request.</li>
				<li>Try to connect with Connection String.</li>
			</ul>
			<div>
				<input id='ConnectionBoxLink' type='button' value='Go Back'/>
			</div>
		 </div>
		<div style="display:flex; justify-content: space-between; font-size: 11px; flex-wrap: wrap;">
			<div style="width:50%">Subscriptions : <span id='countSub'>0</span></div>
			<div style="width:50%">Resource Groups : <span id='countRes'>0</span></div>
			<div style="width:50%">DB Accounts: <span id='countAcc'>0</span></div>
			<div style="width:50%">Databases :<span id='countDb'>0</span></div>
			<div style="width:50%">Containers :<span id='countCont'>0</span></div>
		</div>
	</dialog>
    <dialog id='connectionbox' class='connectionbox'>		
			<div style="text-align: center;padding:0 0 5px 0; font-variant: small-caps; color:lightblue">
				How do you want to connect to Azure Cosmos DB?
			</div>
			<div style="padding:5px 0;">
				<input type='radio' id='connectByVs' name='connectoption'>
				<label for='connectByVs'>Connect by VsCode Azure Account</label>
				<div>
				<select id='mysubs' style='display:none' >
					<option value=''>Select Subscription</option>
				</select>
				</div>
			</div>
        <div style="padding:5px 0;">
            <input type="radio" id='connectBycstring' name='connectoption'/>
            <label for='connectBycstring'>Connect by a Connection String</label>
            <input id="cstringtxt" type="text" disabled="disabled" style="width:100%; margin: 3px 0 0 0">
        </div>              
        <div style="text-align: center;padding:5px 0 0 0;">
            <input type='button' value="Connect" id='ConnectButton' class='commandbutton' >
        </div>
    </dialog>
    <dialog id='queryoptionsbox' class='loadDialog' style='width:550px; height:fit-content; text-align:left; padding-bottom: 5px;'>
		<div style='display:flex;justify-content: space-between;line-height: 20px;'>
			<div>
				<div style='color:gold; padding 0 0 5px 0'>Query Engine Options</div>
				<div>
					<input type='checkbox' checked='checked' id='optionEnableQM' name='optionEnableQM'/>
					<label for='optionEnableQM' title='Use it for debugging slow or expensive queries'>Display Query Metrics</label>
				</div>
				<div>
					<input type='checkbox' id='optionEnableIndexingMetrics' name='optionEnableIndexingMetrics'/>
					<label for='optionEnableIndexingMetrics' title='Use it to see Utilized and Suggested Indexes by Cosmos DB'>Display Indexing Metrics</label>
				</div>
				<div>
					<input type='checkbox' id='optionForceQPlan' name='optionForceQPlan'/>
					<label for='optionForceQPlan' title='For queries like aggregates and most cross partition queries, this happens anyway. However, since the library doesn't know what type of query it is until we get back the first response, some optimization can't happen until later.'>Force Query Plan</label>
				</div>
				<div>
					<label for='optionMaxItemCount' title='Max number of items to be returned in the enumeration operation. Default: undefined (server will defined payload) Expirimenting with this value can usually result in the biggest performance changes to the query.The smaller the item count, the faster the first result will be delivered (for non-aggregates). For larger amounts, it will take longer to serve the request, but you'll usually get better throughput for large queries (i.e. if you need 1000 items before you can do any other actions, set maxItemCount to 1000. If you can start doing work after the first 100, set maxItemCount to 100.)'>Max Item Number</label>
					<input type='number' id='optionMaxItemCount' name='optionMaxItemCount' min='10' value='100' style='width:50px;'  class='optionstbox'/>
				</div>
				<div>
					<label for='optionParellelism' title='The maximum number of concurrent operations that run client side during parallel query execution in the Azure Cosmos DB database service. Negative values make the system automatically decides the number of concurrent operations to run. Default: 0 (no parallelism)'>Max Degree Of Parallelism</label>
					<input type='number' id='optionParellelism' name='optionParellelism' min='-1' max='5' value='0'  class='optionstbox' style='width:50px;'/>
				</div>
			</div>
			<div>
				<div style='color:gold; padding: 0 0 5px 0'>Spatial Data Options</div>
				<div>
					<input type='checkbox' id='optionDisplaySpatialQ'/>
					<label for='optionDisplaySpatialQ' title='Generated Queries will be displayed.'>Display Spatial queries</label>
				</div>
				<div>
					<label for='maxspatialreturn'>Max Spatial Items to return</label>
					<input class='optionstbox' type='number' id='maxspatialreturn' name='maxspatialreturn' value='100' style='width:50px;'/>
				</div>
				<div>
					<label for='spatialprop'>Spatial Property to use in filter</label><br/>
					<input type='text' id='spatialprop' name='spatialprop' value="Location" class='optionstbox' style='width:90%'></input>
				</div>
				<div>
					<label for='spatialpropdraw'>Spatial Property to draw</label><br/>
					<input type='text' id='spatialpropdraw' name='spatialpropdraw' value="Location" class='optionstbox' style='width:90%'></input>
				</div>
			</div>			
		</div>
		<div style='text-align:center; padding: 10px 0 0 0'>
			<input type='button' class='commandbutton' value='Close' onclick='document.getElementById("queryoptionsbox").close();' />
		</div>
    </dialog>
	<dialog id='errorbox' class='errorbox'>
	<table>
	<tbody>
		<tr>
			<td style='font-variant:small-caps;'>Error Code </td>
			<td><label id='errorCode'></label></td>
		</tr>
		<tr>
			<td style='font-variant:small-caps;'>Severity</td>
			<td><label id='errorSeverity'></label></td>
		</tr>
		<tr>
			<td style='font-variant:small-caps;'>Location</td>
			<td><label id='errorLoc'></label></td>
		</tr>
		<tr>		
			<td colspan=2>
			<label id='errortxt'></label>
			</td>			
		</tr>
	</tbody>
	</table>		
		<div style='text-align:center;padding: 15px 0 0 0'>
			<input id='errorboxclosebutton' class='commandbutton' type='button' value='Close' onclick='document.getElementById("errorbox").close();'/>
		</div>
	</dialog>
	<dialog id='partitionsexecution' class='partitionsexecution'>
		<table>
			<thead>
				<tr>
					<td>Partition #</td>
					<td>Retrieved Documents</td>
					<td>Document Size</td>
					<td>Query Execution</td>
					<td>Document Load Time</td>					
					<td>Execution Time</td>
					<td>Request Unit</td>
				</tr>
			</thead>
			<tbody id='partitionmetricsrows'>				
			</tbody>
		</table>
		<div style='padding: 5px 0; text-align:center'>
			<input type='button' class='commandbutton' id='partitionsexecutionclosebutton' value='Close'/>
		</div>		
	</dialog>
	<dialog id='physicalpartitionsdialog' class='partitionsexecution' >
		<table>
			<thead>
				<tr>
					<td>Partition #</td>
					<td>Status</td>
					<td>Min Inclusive</td>
					<td>Max Exclusive</td>
					<td>Throughput Fraction</td>					
				</tr>
			</thead>
			<tbody id='partitionlistrows'>				
			</tbody>
		</table>
		<div style='padding: 5px 0; text-align:center'>
			<input type='button' class='commandbutton' id='physicalpartitionsclosebutton' value='Close' onclick='document.getElementById("physicalpartitionsdialog").close();'/>
		</div>
	</dialog>
	<dialog id='loadingquerybox' class='loadingquerybox'>
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="150px">
		<defs>
		<radialGradient id="a" cx="-105.006" cy="-10.409" r="5.954" gradientTransform="matrix(1.036 0 0 1.027 117.739 19.644)" gradientUnits="userSpaceOnUse">
		<stop offset=".183" stop-color="#5ea0ef"/>
		<stop offset="1" stop-color="#0078d4"/>
		</radialGradient>
		<clipPath id="b">
		<path d="M14.969 7.53a6.137 6.137 0 11-7.395-4.543 6.137 6.137 0 017.395 4.543z" fill="none"/>
		</clipPath>
		</defs>
		<path stroke='black' stroke-width='0.15%' d="M2.954 5.266a.175.175 0 01-.176-.176A2.012 2.012 0 00.769 3.081a.176.176 0 01-.176-.175.176.176 0 01.176-.176A2.012 2.012 0 002.778.72a.175.175 0 01.176-.176.175.175 0 01.176.176 2.012 2.012 0 002.009 2.009.175.175 0 01.176.176.175.175 0 01-.176.176A2.011 2.011 0 003.13 5.09a.177.177 0 01-.176.176zM15.611 17.456a.141.141 0 01-.141-.141 1.609 1.609 0 00-1.607-1.607.141.141 0 01-.141-.14.141.141 0 01.141-.141 1.608 1.608 0 001.607-1.607.141.141 0 01.141-.141.141.141 0 01.141.141 1.608 1.608 0 001.607 1.607.141.141 0 110 .282 1.609 1.609 0 00-1.607 1.607.141.141 0 01-.141.14z" fill="#50e6ff">
		<animate attributeName='fill' values='lawngreen;deepskyblue' dur='4s' repeatCount='indefinite' />
		</path>
		<path d="M14.969 7.53a6.137 6.137 0 11-7.395-4.543 6.137 6.137 0 017.395 4.543z" fill="deepskyblue"/>
		<g clip-path="url(#b)" fill="#f2f2f2">
		<animate attributeName='fill' values='white;gainsboro;ghostwhite;azure' dur='5s' repeatCount='indefinite'/>
		<path d="M5.709 13.115a1.638 1.638 0 10.005-3.275 1.307 1.307 0 00.007-.14A1.651 1.651 0 004.06 8.064H2.832a6.251 6.251 0 001.595 5.051zM15.045 7.815c0-.015 0-.03-.007-.044a5.978 5.978 0 00-1.406-2.88 1.825 1.825 0 00-.289-.09 1.806 1.806 0 00-2.3 1.663 2 2 0 00-.2-.013 1.737 1.737 0 00-.581 3.374 1.451 1.451 0 00.541.1h2.03a13.453 13.453 0 002.212-2.11z"/>
		</g>
		<path stroke='deepskyblue' stroke-width='0.25%' d="M17.191 3.832c-.629-1.047-2.1-1.455-4.155-1.149a14.606 14.606 0 00-2.082.452 6.456 6.456 0 011.528.767c.241-.053.483-.116.715-.151a7.49 7.49 0 011.103-.089 2.188 2.188 0 011.959.725c.383.638.06 1.729-.886 3a16.723 16.723 0 01-4.749 4.051A16.758 16.758 0 014.8 13.7c-1.564.234-2.682 0-3.065-.636s-.06-1.73.886-2.995c.117-.157.146-.234.279-.392a6.252 6.252 0 01.026-1.63 11.552 11.552 0 00-1.17 1.372C.517 11.076.181 12.566.809 13.613a3.165 3.165 0 002.9 1.249 8.434 8.434 0 001.251-.1 17.855 17.855 0 006.219-2.4A17.808 17.808 0 0016.24 8.03c1.243-1.661 1.579-3.15.951-4.198z" fill="#50e6ff">
		<animate attributeName='fill' values='navy;midnightblue;black;midnightblue' dur='5s' repeatCount='indefinite'/>
		</path>
	</svg>
	<div class='loadingqueryboxtext'>Loading...</div>
	</dialog>
	<dialog id='deleteoperationbox' class='deletebox'>
		<div id='deletemissingmsg' style='display:none' class='deleteboxmissingmsg'>
			Partition Key and Document Id values are required.
		</div>
		<div style='text-align:center'>
			<div style='padding: 2px;letter-spacing: 1px; font-weight:bold'>Documents of the following query will be deleted!</div>
			<div id='selecttodelete' class='querytodeletebox' ></div>
		</div>
		<table class='scrolltable'>
			<thead>
				<tr>
					<th>Partition Key</th>
					<th>Document Id</th>
					<th class='width80px'>Status</th>
					<th class='width80px'>R/U Charge</th>
				</tr>
			</thead>
			<tbody id='itemstodeletelist' style='max-height:60vh'>
			</tbody>
		</table>
		<div style='text-align:center; padding:5px; background: dimgray'>			
			<input type='button' class='buttonstyle2' value='Delete' id='StartDeleteButton'></input>
			<input type='button' class='buttonstyle2' value='Close' onclick='document.getElementById("deleteoperationbox").close()'></input>
		</div>		
	</dialog>
    </html>
	<script>
	const vscode = acquireVsCodeApi();
	var editor;
	var resultbox = new JSONFormatter('',2,{theme:'dark', hoverPreviewEnabled:true});
	var cosmosmap;	
	var drawnItems = new L.FeatureGroup();

	document.addEventListener("DOMContentLoaded", function(event){
		//cosmosStudioWeb.FindSubscriptions();
		document.getElementById("connectionbox").showModal();
			editor = ace.edit("querysource",{
				mode: "ace/mode/sql"
			});
			editor.session.setMode("ace/mode/sql");
			editor.setShowPrintMargin(false);
			editor.setOptions({
				enableBasicAutocompletion: false,
				enableSnippets: true,
				enableLiveAutocompletion: false
			});
			cosmosmap = L.map("cosmosmap").setView([30.35, -90.08], 7);
    		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        		maxZoom: 10,
        		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    		}).addTo(cosmosmap);			
			cosmosmap.addLayer(drawnItems);
			var drawControl = new L.Control.Draw({
				draw:{
					marker: false,
					circle:false,
					polyline:false,
					circlemarker: false
				},
				edit: {
					featureGroup : drawnItems,
					edit:false
				}
			});
			cosmosmap.addControl(drawControl);

			cosmosmap.on(L.Draw.Event.CREATED, function(event){
				cosmosStudioWeb.AddItemToMap(event,drawnItems);
			});

			cosmosmap.on(L.Draw.Event.DELETED, function(event){				
				cosmosStudioWeb.RemoveItemsFromMap(event);
			});			
			cosmosStudioWeb.RenderQueryResults(null);			
	});

	document.getElementById('ConnectionBoxLink').addEventListener("click", function(){
		document.getElementById("authError").style.display = 'none';
		document.getElementById("loadingbox").close();
		document.getElementById("connectionbox").showModal();
	});

	document.getElementById('deleteButton').addEventListener("click", function(){
		cosmosStudioWeb.DeleteDataClicked();
	});

	document.getElementById('StartDeleteButton').addEventListener("click", function(){		
		cosmosStudioWeb.StartDeletingRows();
	});

	document.getElementById("darkmodeToggle").addEventListener("click", function(){
		var current = this.dataset.flag;
		if (current == 1){
			document.getElementById("darkmodeToggle").classList.remove('toggle1selected');
			this.dataset.flag = 0;			
			resultbox.config.theme='';
			document.getElementById('bottomcontainer').classList.add('whitebackground');
		} else{
			document.getElementById("darkmodeToggle").classList.add('toggle1selected');
			this.dataset.flag = 1;			
			resultbox.config.theme='dark';
			document.getElementById('bottomcontainer').classList.remove('whitebackground');
		}
		cosmosStudioWeb.RenderQueryResults(cosmosStudioWeb.currentdata);
	});
	
	document.getElementById("RunQuery").addEventListener("click", function(){
		cosmosStudioWeb.HandleQueryExecution();
	});	

	document.getElementById("pointreadbutton").addEventListener("click", function(){
		cosmosStudioWeb.ClearExecutionMetrics();
		cosmosStudioWeb.PointRead();
	});

	var tablinks = document.getElementsByClassName("tablink");
	Array.from(tablinks).forEach(function(element){
		element.addEventListener('click', tablinkClicked);
	});	

	function tablinkClicked(e){
		Array.from(tablinks).forEach(function(element){
			element.classList.remove('selectedtablink');
		});		
		var destination = this.getAttribute("data-destination");
		document.getElementById('queryresults').style.display = 'none';
		document.getElementById('indexingresults').style.display = 'none';
		document.getElementById('spatialresults').style.display = 'none';		
		document.getElementById('analyzeresults').style.display = 'none';
		document.getElementById('qanalyzer').style.display = 'none';		
		if (destination){
			document.getElementById(destination).style.display = 'block';
			this.classList.add('selectedtablink');
			if (destination == 'analyzeresults' || destination =='qanalyzer' || destination == 'spatialresults'){
				document.getElementById("darkmodeToggle").style.display = 'none';
			} else{
				document.getElementById("darkmodeToggle").style.display = 'block';
			}
		}		
		cosmosmap.invalidateSize();
	}

	document.getElementById("QueryOptionsButton").addEventListener("click", function(){
		document.getElementById("queryoptionsbox").showModal();
	});

	document.getElementById("PartitionListButton").addEventListener("click", function(){		
		var db = document.getElementById('cosmosdblist').value;
		var container = document.getElementById("cosmoscontainers").value;
		cosmosStudioWeb.FindPhysicalPartitions(db,container);
	});

	document.getElementById("partitionsexecutionclosebutton").addEventListener("click", function(){
		document.getElementById("partitionsexecution").close();
	});	

	document.getElementById("connectBycstring").addEventListener("change", function() {		
		if (document.getElementById("connectBycstring").checked){
			document.getElementById("cstringtxt").disabled = false;
		} else{
			document.getElementById("cstringtxt").disabled = true;
		}
	});

	document.getElementById("schemalist").addEventListener("change",function(){		
		cosmosStudioWeb.RenderChart();
	});

	document.getElementById("timelineschemalist").addEventListener("change",function(){		
		cosmosStudioWeb.RenderChart();
	});	

	document.getElementById("ConnectButton").addEventListener("click", function(){
		var cstring = document.getElementById("connectBycstring").checked;
		cosmosStudioWeb.HandleConnection(cstring);		
	});

	document.getElementById("PointReadLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		cosmosStudioWeb.HandleInfoBoxes(dest);
	});

	document.getElementById("OverallLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		cosmosStudioWeb.HandleInfoBoxes(dest);		
	});

	document.getElementById("ExecutionMetricsLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		cosmosStudioWeb.HandleInfoBoxes(dest);
	});

	document.getElementById("IndexinPolicyLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		cosmosStudioWeb.HandleInfoBoxes(dest);
	});

	document.getElementById("numberOfPartitions").addEventListener("click", function(){
		if (document.getElementById("numberOfPartitions").classList.contains("partitionexecutionmetriclink"))
		{
			document.getElementById("partitionsexecution").showModal();
		} 
	});
	
	document.getElementById("cosmosdblist").addEventListener("change", function(){
		var current = document.getElementById('cosmosdblist').value;
		document.getElementById('cosmosdbpkeyname').innerHTML = 'Partition Key:';		
		cosmosStudioWeb.DbChanged(current);
	});		

	document.getElementById("cosmoscontainers").addEventListener("change", function(){
		cosmosStudioWeb.ContainerChanged(this.value);
	});

	document.getElementById("optionEnableIndexingMetrics").addEventListener("change", function(){
		if (this.checked){
			document.getElementById("IndexingMetricstablink").style.display = 'block';
		} else {
			document.getElementById("IndexingMetricstablink").style.display ='none';
		}
	});

	document.getElementById("QueryAnalyzerStatusButton").addEventListener("click", function(){
		if (this.value == 'Start'){
			this.value = 'Pause';
			this.style.background='red';
		} else{
			this.value = 'Start';
			this.style.background='seagreen';
		}
	});

	document.getElementById("QueryAnalyzerClearButton").addEventListener("click", function(){
		var temp = document.querySelectorAll('.TrialQuery');
		temp.forEach(box => { box.remove();});
		queryhistory = [];
		var comparison = document.querySelectorAll('.QComparisonRow[data-result=true]');
		comparison.forEach(res => {res.remove();});
	});
	</script>
	</body>
	</html>`;
};

function deactivate() {}

module.exports = {
	activate,
	deactivate
};

/*const js1 = vscode.Uri.file(
					path.join(context.extensionPath,'webview1.js')
				);
				var js1loc = panel.webview.asWebviewUri(js1);

				const jsonjs = vscode.Uri.file(
					path.join(context.extensionPath,'/node_modules/json-formatter-js/dist/json-formatter.umd.js')
				);
				var js2loc = panel.webview.asWebviewUri(jsonjs);

				const sqljs = vscode.Uri.file(
					path.join(context.extensionPath,'/customJs/src-min-noconflict/ace.js')
				);
				var js3loc = panel.webview.asWebviewUri(sqljs);

				const sqljs2 = vscode.Uri.file(
					path.join(context.extensionPath,'/customJs/src-min-noconflict/mode-sql.js')
				);
				var js4loc = panel.webview.asWebviewUri(sqljs2);
				const sqljs3 = vscode.Uri.file(
					path.join(context.extensionPath,'/customJs/src-min-noconflict/ext-language_tools.js')
				);
				var js5loc = panel.webview.asWebviewUri(sqljs3);
				
				const chartjs = vscode.Uri.file(
					path.join(context.extensionPath,'node_modules/chart.js/dist/chart.min.js')
				);
				var j6loc = panel.webview.asWebviewUri(chartjs);
*/

/*
async function CreateNewDatabase(name){
	try{
		const {database} = await client.databases.createIfNotExists({id: name});
		vscode.window.showInformationMessage(database.id + ' is created.');
		return database;
	}
	catch(error){
		vscode.window.showErrorMessage(error);
	}	
};*/

/*
async function ExecuteQuery(dbname, containerid, query, options){
	try{
	var indexingmetrics= null;
	if (options.populateIndexingMetrics){
		indexingmetrics = await GetIndexMetrics(dbname, containerid, query);
	}
	//options.ConsistencyLevel = "Eventual";
	const container = cosmosClient.database(dbname).container(containerid);	
	const queryIterator = container.items.query(query, options);
	let count = 0;
	var cosmosResponse = await CreateNewCosmosResponseObj();
	cosmosResponse.indexingMetrics = indexingmetrics;	
	
	while (queryIterator.hasMoreResults() && count <= 100000) {	
		
		const resources = await queryIterator.fetchNext();
		//if (resources.requestCharge > 0){ 			cosmosResponse.requests++;		}
		cosmosResponse.charge += Number(resources.headers['x-ms-request-charge']);
		cosmosResponse.result = cosmosResponse.result.concat(resources.resources);		
		if (resources.queryMetrics){			
			for (const prop in resources.queryMetrics){				
				if (resources.queryMetrics[prop]){
					cosmosResponse.requests++;
					cosmosResponse.queryMetrics.push(resources.queryMetrics[prop]);
					cosmosResponse.qms.push(await CreateQueryMetrics(prop, resources.queryMetrics[prop]));					
				}
			}			
		}
	}	
	return await HandleQueryMetricsCalculation(cosmosResponse);	
}
	catch(e){
		cosmosResponse.hasError = true;
		cosmosResponse.error = await HandleErrorTxt(e.message);		
		return cosmosResponse;
	}
};*/

/*
async function GetIndexMetrics(dbname, containername, query){
	var hashed = await HashIt(query);
	if (lastindexingmetrics.db == dbname && lastindexingmetrics.container == containername && lastindexingmetrics.result && lastindexingmetrics.queryhash == hashed){
		return lastindexingmetrics.result;
	} else {
		lastindexingmetrics.db = dbname;
		lastindexingmetrics.container = containername;
		lastindexingmetrics.queryhash = await HashIt(query);
	}	
	var q ={
		query:query,
		parameters:[]
	}	
	var dt = cosmosClient.database(dbname);
	var endpoint = dt.clientContext.cosmosClientOptions.endpoint;
	var key = dt.clientContext.cosmosClientOptions.key;
	var url = endpoint +"/dbs/" + dbname + "/colls/"+ containername + "/docs";
	var pkeyrange = null;
	if (pkeyranges.dbname == dbname && pkeyranges.container == containername && pkeyranges.partitions){
		pkeyrange = pkeyranges.partitions.PartitionKeyRanges[0].id;
	} else {
		await FindPhysicalPartitions(dbname, containername);
		pkeyrange = pkeyranges.partitions.PartitionKeyRanges[0].id;
	}
	lastindexingmetrics.result = "N/A";
	var response = await fetch(url,
		{
			method: 'POST',
			headers: await CreateRequiredHeadersforApi('POST', dbname, containername, key, true,pkeyrange),
			body: JSON.stringify(q)
		}); //.then(response=>response.json());
		//check the status to continue
		if (response.ok){
			var indexmetrics = response.headers.get('x-ms-cosmos-index-utilization');
			if (indexmetrics){
				var result = Buffer.from(indexmetrics,'base64').toString();
				lastindexingmetrics.result = JSON.parse(result);
			}
		}		
	return lastindexingmetrics.result
}*/

/*async function HashIt(value){	
		return value.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);	 
}*/

/*var lastindexingmetrics = {
	db:'', container:'', queryhash:'', result:{}
};*/

/*var pkeyranges = {
	dbname: null,
	container:null,
	partitions:undefined
};*/

/*
async function FindPhysicalPartitions(dbname, containername){
	var dt = cosmosClient.database(dbname);
	var endpoint = dt.clientContext.cosmosClientOptions.endpoint;
	var key = dt.clientContext.cosmosClientOptions.key;
	var url = endpoint +"/dbs/" + dbname + "/colls/"+ containername + "/pkranges";
	pkeyranges.dbname = dbname;
	pkeyranges.container = containername;
	pkeyranges.partitions = await fetch(url,
	{
		method: 'GET',
		headers: await CreateRequiredHeadersforApi('GET', dbname, containername, key, false)		
	}).then(response=>response.json());
	return pkeyranges.partitions;
}*/

/*
async function CreateRequiredHeadersforApi(action, dbname, containername, key, forquery, pkeyrangeid){
	var now = new Date().toUTCString();	
	var rtype = "pkranges";
	if (forquery){
		var rtype = "docs";
	}
	var rid = "dbs/" + dbname + "/colls/" + containername;
	var text = (action || "").toLowerCase() + "\n" + (rtype || "").toLowerCase() + "\n" + (rid || "") + "\n" + now.toLowerCase() + "\n" + "" + "\n";
	var key = cryptoJs.enc.Base64.parse(key);
	var signature = cryptobase.HmacSHA256(text,key).toString(cryptoJs.enc.Base64);
	var MasterToken = "master";
	var TokenVersion = "1.0";
	var authToken = encodeURIComponent("type=" + MasterToken + "&ver=" + TokenVersion + "&sig=" + signature);	
	var headers = new fetch.Headers({
		'authorization':authToken,
		'x-ms-date':now,
		'x-ms-version':'2018-12-31'
		//'x-ms-cosmos-populateindexmetrics':true
	});	
	if (forquery){
		headers.append('Content-Type','application/query+json');
		headers.append('x-ms-documentdb-isquery', true);
		headers.append('x-ms-documentdb-query-enablecrosspartition',true);
		headers.append('x-ms-cosmos-populateindexmetrics',true);		
	} else{
		headers.append('Content-Type','application/json');
	}
	if (pkeyrangeid){
		headers.append('x-ms-documentdb-partitionkeyrangeid',pkeyrangeid);
	}
	return headers;
}*/

/*
async function CreateNewCosmosResponseObj(){
	return {
		result:[],
		queryMetrics:[],
		indexingMetrics: {},
		charge:0,
		count:0,
		hasError: false,
		error: '',
		requests:0,
		qms:[],
		qm:{
			partitionid: 0,
			numberofpartition:0,
			documentLoadTime:0,
			documentWriteTime:0,
			indexHitDocumentCount:0,
			indexHitRatio:0,
			indexHitLookupTime:0,
			outputDocumentCount:0,
			outputDocumentSize:0,
			queryPreparationTimes:{
				logicalPlanBuildTime:0,
				physicalPlanBuildTime:0,
				queryCompilationTime:0,
				queryOptimizationTime:0
			},
			retrievedDocumentCount:0,
			retrievedDocumentSize:0,
			runtimeExecutionTimes:{
				queryEngineExecutionTime:0,
				systemFunctionExecutionTime:0,
				userDefinedFunctionExecutionTime:0
			},
			totalQueryExecutionTime:0,
			vmExecutionTime:0,
			requestUnits:0
		}
	};
}*/

/*
async function HandleQueryMetricsCalculation(cosmosResponse){
	for (var q=0;q<cosmosResponse.queryMetrics.length; q++){
		if (cosmosResponse.queryMetrics[q])		{
		cosmosResponse.qm.documentLoadTime += cosmosResponse.queryMetrics[q].documentLoadTime._ticks / 10000;
		cosmosResponse.qm.documentWriteTime += cosmosResponse.queryMetrics[q].documentWriteTime._ticks / 10000;
		cosmosResponse.qm.indexHitDocumentCount += cosmosResponse.queryMetrics[q].indexHitDocumentCount;
		cosmosResponse.qm.indexHitLookupTime += cosmosResponse.queryMetrics[q].indexLookupTime._ticks / 10000;
		cosmosResponse.qm.outputDocumentCount += cosmosResponse.queryMetrics[q].outputDocumentCount;
		cosmosResponse.qm.outputDocumentSize += cosmosResponse.queryMetrics[q].outputDocumentSize;
		cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.logicalPlanBuildTime._ticks / 10000;
		cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.physicalPlanBuildTime._ticks /10000;
		cosmosResponse.qm.queryPreparationTimes.queryCompilationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryCompilationTime._ticks / 10000;
		cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryOptimizationTime._ticks / 10000;
		cosmosResponse.qm.retrievedDocumentCount += cosmosResponse.queryMetrics[q].retrievedDocumentCount;
		cosmosResponse.qm.retrievedDocumentSize += cosmosResponse.queryMetrics[q].retrievedDocumentSize;
		cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.queryEngineExecutionTime._ticks/10000;
		cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.systemFunctionExecutionTime._ticks/10000;
		cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.userDefinedFunctionExecutionTime._ticks/10000;
		cosmosResponse.qm.totalQueryExecutionTime += cosmosResponse.queryMetrics[q].totalQueryExecutionTime._ticks/10000;
		cosmosResponse.qm.vmExecutionTime += cosmosResponse.queryMetrics[q].vmExecutionTime._ticks/10000;
		}		
	}
	cosmosResponse.qm.indexHitDocumentCount = cosmosResponse.qm.indexHitDocumentCount.toFixed(2);
	cosmosResponse.qm.documentLoadTime = await TakeAverage(cosmosResponse.qm.documentLoadTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.documentWriteTime = await TakeAverage(cosmosResponse.qm.documentWriteTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.indexHitLookupTime = await TakeAverage(cosmosResponse.qm.indexHitLookupTime, cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime = await TakeAverage(cosmosResponse.qm.queryPreparationTimes.logicalPlanBuildTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime = await TakeAverage(cosmosResponse.qm.queryPreparationTimes.physicalPlanBuildTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.queryCompilationTime = await TakeAverage(cosmosResponse.qm.queryPreparationTimes.queryCompilationTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime = await TakeAverage(cosmosResponse.qm.queryPreparationTimes.queryOptimizationTime,cosmosResponse.queryMetrics.length);

	cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime = await TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.queryEngineExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime = await TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.systemFunctionExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime = await TakeAverage(cosmosResponse.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.totalQueryExecutionTime = await TakeAverage(cosmosResponse.qm.totalQueryExecutionTime,cosmosResponse.queryMetrics.length);
	cosmosResponse.qm.vmExecutionTime = await TakeAverage(cosmosResponse.qm.vmExecutionTime,cosmosResponse.queryMetrics.length);

	cosmosResponse.qm.outputDocumentSize = await formatBytes(cosmosResponse.qm.outputDocumentSize);
	cosmosResponse.qm.retrievedDocumentSize = await formatBytes(cosmosResponse.qm.retrievedDocumentSize);
	cosmosResponse.count = cosmosResponse.result.length;
	cosmosResponse.qm.numberofpartition = cosmosResponse.queryMetrics.length;
	return cosmosResponse;
}*/

/*
async function TakeAverage(number, counter){
	if (number == 0){
		return 0;
	}
	return number / counter;
}*/

/*
async function formatBytes(bytes,decimals =2){
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const dm = decimals <0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB','GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k,i)).toFixed(dm))+ ' ' + sizes[i];
};*/

/*
async function CreateQueryMetrics(pid, qmetrics){
	return {
		partitionid :pid,
		documentLoadTime : qmetrics.documentLoadTime._ticks / 10000,
		documentWriteTime : qmetrics.documentWriteTime._ticks / 10000,
		indexHitDocumentCount : qmetrics.indexHitDocumentCount.toFixed(2),
		indexHitLookupTime : qmetrics.indexLookupTime._ticks / 10000,
		outputDocumentCount : qmetrics.outputDocumentCount,
		outputDocumentSize : await formatBytes(qmetrics.outputDocumentSize),
		//queryPreparationTimes.logicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.logicalPlanBuildTime._ticks / 10000;
		//queryPreparationTimes.physicalPlanBuildTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.physicalPlanBuildTime._ticks /10000;
		//queryPreparationTimes.queryCompilationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryCompilationTime._ticks / 10000;
		//queryPreparationTimes.queryOptimizationTime += cosmosResponse.queryMetrics[q].queryPreparationTimes.queryOptimizationTime._ticks / 10000;
		retrievedDocumentCount : qmetrics.retrievedDocumentCount,
		retrievedDocumentSize : await formatBytes(qmetrics.retrievedDocumentSize),
		//runtimeExecutionTimes.queryEngineExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.queryEngineExecutionTime._ticks/10000;
		//runtimeExecutionTimes.systemFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.systemFunctionExecutionTime._ticks/10000;
		//runtimeExecutionTimes.userDefinedFunctionExecutionTime += cosmosResponse.queryMetrics[q].runtimeExecutionTimes.userDefinedFunctionExecutionTime._ticks/10000;
		totalQueryExecutionTime : qmetrics.totalQueryExecutionTime._ticks/10000,
		vmExecutionTime : qmetrics.vmExecutionTime._ticks/10000,
		requestUnits: qmetrics.clientSideMetrics.requestCharge
	};
};*/

/*async function HandleErrorTxt(message){
	try{
		var custom = message.replace("Message: ","");
		custom = custom.slice(0, custom.indexOf('\r'));
		return JSON.parse(custom);
	}
	catch (e){
		return message;
	}	
}*/

/*async function PointRead(dbname, containerid, pkey, id){
	const container = cosmosClient.database(dbname).container(containerid);
	//var temp =await container.readPartitionKeyDefinition();
	var isNumber = Number(pkey);
	var item = container.item(id,pkey);
	var resource = await item.read();
if (resource.statusCode = 404 && isNumber){
	item = container.item(id,isNumber);
	resource = await item.read();
}
	var cosmosResponse ={
		result:[resource.resource],
		charge:resource.requestCharge,
		count:1
	};
	return cosmosResponse;

};*/

/*
async function DeleteDocument(dbname, containerid, pkey, docid){	
	const container = cosmosClient.database(dbname).container(containerid);
	var item = await container.item(docid, pkey); //.read();	
	var result = await item.delete();
	return {pkey: pkey, id:docid, status: result.statusCode, ru: result.requestCharge}
	//return result.statusCode == 204;
}*/

/*async function GetDatabases2(){	
	var requestOptions ={};
	requestOptions.populateQuotaInfo=true;
	var { resources} = await cosmosClient.databases.readAll().fetchAll();
	panel.webview.postMessage({command:'dbCount', jsonData: resources.length});
	for (var i=0; i<resources.length; i++){
		var info ={}; // = (({consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}) => ({ consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}))(account);
		info.name = resources[i].id;
		panel.webview.postMessage({command:'addDb', jsonData: info});		
		var temp = await cosmosClient.database(resources[i].id).containers.readAll({populateQuotaInfo:true}).fetchAll();
		//var test = await cosmosClient.database(resources[i].id).container(temp.resources[0].id).read({populateQuotaInfo:true});
		var containerList = temp.resources;		
		for (var c=0; c< containerList.length;c++){			
			panel.webview.postMessage({command:'contCount', jsonData: containerList.length});
			panel.webview.postMessage({command:'addCon', jsonData: {
				container: containerList[c].id, 
				db: resources[i].id, 
				pkey: containerList[c].partitionKey.paths[0], 
				indexing: containerList[c].indexingPolicy,
				conflict: containerList[c].conflictResolutionPolicy.mode
			}});
		}	
	}
};	*/

/*
async function GetSubscriptons(){	
	return subClient.subscriptions.list().then((result) => {
		myAzure.subs = result;
		return result;
	}).catch((err) => {	
		vscode.window.showErrorMessage(err.message);	
	  	//console.error(err);
	  	return null;
	});
};*/

/*
async function GetDatabaseAccounts(){	
	return await cosmosArmClient.databaseAccounts.list().then((result) => {
		myAzure.accounts.push(result);		
		return result;
	  }).catch((err) => {		
		console.error(err);
		return null;
	  });
};*/

/*
async function GetResourceGroups(){	
	return resClient.resourceGroups.list().then((result) => {
		myAzure.rgroups.push(result);	  
		return result;
	}).catch((err) => {		
		console.error(err);
		return null;
	  });
};*/

/*
var myAzure ={
	subs:[],
	rgroups :[],
	accounts:[],
	dbs:[],
	cstring:[]
};*/

/*async function GetConnectionString(rgroup, dbacct){
	return cosmosArmClient.databaseAccounts.listConnectionStrings(rgroup,dbacct.name).then((cstr)=>{
		myAzure.cstring.push(cstr);
		var temp = cstr.connectionStrings.filter(function(a){return a.description == "Primary Read-Only SQL Connection String"});
		return temp[0];
	});
}*/

/*
async function GetDatabases(subid,rgroup, account){	
	return await cosmosArmClient.sqlResources.listSqlDatabases(rgroup,account.name).then((result)=>{
		panel.webview.postMessage({command:'dbCount', jsonData: result.length});
		for (var d=0; d<result.length; d++){			
			var info = (({consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}) => ({ consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}))(account);
			info.name = result[d].name;
			panel.webview.postMessage({command:'addDb', jsonData: info});
			GetContainers(rgroup,account.name,result[d].name, subid, result[d].resource._rid);
		}		
		return result;		
	}).catch((err)=>{
		console.log(err);
		return null;
	});
};*/


/*async function GetContainers(rgroup, account, dbname, subid, testrid){
	//const client2 = new CosmosDBManagementClient(creds, subid);		
	cosmosArmClient.sqlResources.listSqlContainers(rgroup,account,dbname).then((result) =>{
		if (result.length > 0){
			panel.webview.postMessage({command:'contCount', jsonData: result.length});
			var dbarm = CreateAzureArmItem(subid, rgroup, account, dbname,[]);
			for (var c=0; c<result.length; c++){
				var cont = {
					container: result[c].name, 
						db: dbname, 
						pkey: result[c].resource.partitionKey.paths[0], 
						indexing: result[c].resource.indexingPolicy,
						conflict: result[c].resource.conflictResolutionPolicy.mode,
						ukey: 'Not Found'
				}
				if (result[c].resource.uniqueKeyPolicy != undefined){
					cont.ukey = result[c].resource.uniqueKeyPolicy.uniqueKeys[0].paths[0]
				} 			
				panel.webview.postMessage({
					command:'addCon', 
					jsonData: cont
				});
				dbarm.colls.push({name: result[c].name, pkey: result[c].resource.partitionKey.paths[0], indexing: result[c].resource.indexingPolicy});
				
			}
			cosmosMaster.push(dbarm);
			//console.log(dbarm);
		}
		
		
	}).catch((err) => {
		console.log(err);
	});
};*/

/*
function CreateAzureArmItem(subid,rgroup,account,dbname,colls){
	return {
		subscription: subid,
		resGrp: rgroup,
		dbAcct: account,
		dbName: dbname,
		colls: colls
		};
};*/

/*
async function HandleToken(){
	await creds.getToken(); //'https://login.microsoftonline.com/.default');
}
*/

//var subClient = new SubscriptionClient(creds);
//var resClient;
//var cosmosArmClient;
//var panel;
//var cosmosMaster = [];