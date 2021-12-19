const vscode = require('vscode');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');
const { CosmosDBManagementClient } = require("@azure/arm-cosmosdb");
const { DefaultAzureCredential } = require("@azure/identity");
const { ResourceManagementClient } = require('@azure/arm-resources');
const { SubscriptionClient } = require("@azure/arm-subscriptions");
var cosmosClient;
const creds = new DefaultAzureCredential();
creds.getToken();
var subClient = new SubscriptionClient(creds);
var resClient; //= new ResourceManagementClient(creds);
var cosmosArmClient;// = new CosmosDBManagementClient(creds);
var panel;
var cosmosMaster = [];
var myAzure ={
	subs:[],
	rgroups :[],
	accounts:[],
	dbs:[],
	cstring:[]
};

async function GetSubscriptons(){	
	return subClient.subscriptions.list().then((result) => {
		myAzure.subs = result;
		return result;
	}).catch((err) => {		
	  	console.error(err);
	  	return null;
	});
};

async function GetResourceGroups(){	
	return resClient.resourceGroups.list().then((result) => {
		myAzure.rgroups.push(result);	  
		return result;
	}).catch((err) => {		
		console.error(err);
		return null;
	  });
};

async function GetDatabaseAccounts(){	
	return await cosmosArmClient.databaseAccounts.list().then((result) => {
		myAzure.accounts.push(result);		
		return result;
	  }).catch((err) => {		
		console.error(err);
		return null;
	  });
};

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
};

async function GetConnectionString(rgroup, dbacct){
	return cosmosArmClient.databaseAccounts.listConnectionStrings(rgroup,dbacct.name).then((cstr)=>{
		myAzure.cstring.push(cstr);
		var temp = cstr.connectionStrings.filter(function(a){return a.description == "Primary Read-Only SQL Connection String"});
		return temp[0];
	});
}

async function GetDatabases2(){	
	var { resources} = await cosmosClient.databases.readAll().fetchAll();
	panel.webview.postMessage({command:'dbCount', jsonData: resources.length});
	for (var i=0; i<resources.length; i++){
		var info ={}; // = (({consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}) => ({ consistencyPolicy, enableAnalyticalStorage, enableAutomaticFailover, enableFreeTier, location, backupPolicy}))(account);
		info.name = resources[i].id;
		panel.webview.postMessage({command:'addDb', jsonData: info});
		//const {containers4: resources} = await cosmosClient.database(resources[i].id).containers.readAll().fetchAll();
		var temp = await cosmosClient.database(resources[i].id).containers.readAll().fetchAll();
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
};	

function CreateAzureArmItem(subid,rgroup,account,dbname,colls){
	return {
		subscription: subid,
		resGrp: rgroup,
		dbAcct: account,
		dbName: dbname,
		colls: colls
		};
};

async function GetContainers(rgroup, account, dbname, subid, testrid){
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
				/*client2.collectionPartition.listUsages(rgroup,account,testrid,result[c].resource._rid).then((temp)=>{
					var test = 1;
				});*/
			}
			cosmosMaster.push(dbarm);
			//console.log(dbarm);
		}
		
		
	}).catch((err) => {
		console.log(err);
	});
	/*
	client2.collectionPartition.listUsages(rgroup,account,dbname,'Orders').then((result)=>{
console.log(result);
	}).catch((err)=>{
		console.log(err);
	});*/
};

async function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('cosmosdb.openEditor', () => {
			panel = vscode.window.createWebviewPanel(
				'CosmosEditor', 
				'Cosmos DB Editor', 
				vscode.ViewColumn.One,
				{
					enableScripts: true
				});
				const js1 = vscode.Uri.file(
					path.join(context.extensionPath,'webview1.js')
				);
				var js1loc = panel.webview.asWebviewUri(js1);

				const css1 = vscode.Uri.file(
					path.join(context.extensionPath,'webview.css')
				);
				var css1loc = panel.webview.asWebviewUri(css1);

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


				panel.webview.html = getWebviewContent(js1loc,js2loc,js3loc,js4loc,js5loc,css1loc);

				panel.webview.onDidReceiveMessage(
					async message => {
						switch(message.command){
							case 'newdatabase':
								await CreateNewDatabase("FromVsCode2");
								break;
							case 'execute':
								var response = await ExecuteQuery(message.conf.db,message.conf.cont,message.conf.q, message.conf.options);
								panel.webview.postMessage({command:'load', response:response});								
								break;
							case 'pointread':
								var response = await PointRead(message.conf.db, message.conf.cont, message.conf.pkey,message.conf.id);
								panel.webview.postMessage({command:'load', response:response});
									break;
							case 'init':								
								await GetSubscriptons().then((subs) =>{	
									panel.webview.postMessage({command:'subCount', jsonData: subs.length});																		
									if (subs != null  & subs.length > 0){																				
										for (var s=0; s< subs.length; s++){
											var sid = subs[s].subscriptionId;
											cosmosArmClient = new CosmosDBManagementClient(creds, sid);	
											GetDatabaseAccounts(sid).then((dbacct)=>{
												panel.webview.postMessage({command:'accCount', jsonData: dbacct.length});												
												resClient = new ResourceManagementClient(creds, sid);
												GetResourceGroups(sid).then((resources) =>{
													panel.webview.postMessage({command:'resCount', jsonData: resources.length});
													for (var d=0; d<dbacct.length; d++){
														for (var g=0; g<resources.length; g++){	
															GetConnectionString(resources[g].name, dbacct[d]).then((cstring)=>{
																cosmosClient = new CosmosClient(cstring.connectionString);																
															});
															GetDatabases(sid,resources[g].name, dbacct[d]);
														}
													}
												});
											});
										}
									}
								});							
								break;
							case 'cstring':
								cosmosClient = new CosmosClient(message.conn);
								GetDatabases2();
								break;
						}
					},
					undefined,
					context.subscriptions
				);
			})
	);	
};

function getWebviewContent(js1,js2,js3,js4,js5,css1){
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Cosmos DB SQL</title>
		<link rel="stylesheet" href='` + css1 +`'/>
		<script src='` + js1 +`'></script>
		<script src='` + js2 +`'></script>
		<script src='` + js3 +`'></script>
		<script src='` + js4 +`'></script>
		<script src='` + js5 +`'></script>
	</head>
	<body>
        <div class="maingridcontainer">
            <div class="containergriditem connectcontainer">
                <div>
                    <label>Database : </label>
                    <select id="cosmosdblist">
                        <option>Select one</option>
                    </select>
                </div>
                <div>
                    <label>Container :</label>
                    <select id="cosmoscontainers"></select>
                </div>
                <div>
                    <input type="button" id="QueryOptionsButton" value="Options" class="commandbutton"/>
                    <input type="button" id="RunQuery" value="Execute" class="commandbutton"/>			
                </div> 
                <div class="pointreadbox">
                    <label id='cosmosdbpkeyname'>Partition Key :</label>
                    <input id='cosmosdbpkey' type="text" style="width:70px;"/>
                    <label>Id :<label>
                    <input id='cosmosdbid' type="text" style="width:70px;"/>
                    <input id='pointreadbutton' type="button" value="Point Read" class="commandbutton"/>
                </div>
            </div>
            <div class="containergriditem querycontainer" id="querysource"></div>
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
            <div class="containergriditem bottomcontainer">
                <div id="queryresults" class="queryresults"></div>
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
                            <div class="alignleft">Excluded Properties</div>
                            <div id="excludedPaths" style='font-weight:bold'></div>
                        </div>		
                        <div class="samegroup">
                            <div class="alignleft">Included Properties</div>
                            <div id="includedPaths" style='font-weight:bold'></div>
                        </div>
                        <div class="samegroup">
                            <div class="alignleft">Spatial Indexes</div>
                            <div id="spatialIndexes" style='font-weight:bold'></div>
                        </div>
                    </div>
                    <div id='ExecutionMetricsBox' class='MetricsBox'>
                        <div class='samegroup'>		   		
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
            <input type='radio' checked='checked' id='connectByVs' name='connectoption'>
            <label for='connectByVs'>Connect by VS Code Azure</label>
        </div>  
        <div style="padding:5px 0;">
            <input type="radio" id='connectBycstring' name='connectoption'/>
            <label for='connectBycstring'>Connect by a Connection String</label>
            <input id="cstringtxt" type="text" disabled="disabled" style="width:100%; margin: 3px 0 0 0">
        </div>              
        <div style="text-align: center;padding:5px 0 0 0;">
            <input type='button' value="Connect" id='ConnectButton' >
        </div>
    </dialog>
    <dialog id='queryoptionsbox' class='loadDialog' style='width:fit-content; height:fit-content; text-align:left'>
        <table>
            <tbody>
                <tr>
                    <td colspan=2>
                        <input type='checkbox' checked='checked' id='optionEnableQM' name='optionEnableQM'/>
                        <label for='optionEnableQM' title='Use it for debugging slow or expensive queries'>Display Query Metrics</label>
                    </td>				
                </tr>
                <tr>
                    <td>
                    <label for='optionParellelism' title='The maximum number of concurrent operations that run client side during parallel query execution in the Azure Cosmos DB database service. Negative values make the system automatically decides the number of concurrent operations to run. Default: 0 (no parallelism)'>maxDegreeOfParallelism</label>
                    </td>
                    <td>
                        <input type='number' id='optionParellelism' name='optionParellelism' min='-1' max='5' value='0' style='width:50px;'/>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label for='optionMaxItemCount' title='Max number of items to be returned in the enumeration operation. Default: undefined (server will defined payload) Expirimenting with this value can usually result in the biggest performance changes to the query.The smaller the item count, the faster the first result will be delivered (for non-aggregates). For larger amounts, it will take longer to serve the request, but you'll usually get better throughput for large queries (i.e. if you need 1000 items before you can do any other actions, set maxItemCount to 1000. If you can start doing work after the first 100, set maxItemCount to 100.)'>maxItemCount</label>
                    </td>
                    <td>
                        <input type='number' id='optionMaxItemCount' name='optionMaxItemCount' min='10' value='100' style='width:50px;'/>
                    </td>
                </tr>
                <tr>
                    <td colspan=2 style='text-align:center'>
                    <input type='button' value='Close' onclick='document.getElementById("queryoptionsbox").close();' />
                    </td>
                </tr>
            </tbody>
        </table>	
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
			<input id='errorboxclosebutton' type='button' value='Close' onclick='document.getElementById("errorbox").close();'/>
		</div>
	</dialog>
    </html>
	<script>
	const vscode = acquireVsCodeApi();
	var editor;	

	document.addEventListener("DOMContentLoaded", function(event){
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
	});	
	
	document.getElementById("RunQuery").addEventListener("click", function(){
		HandleQueryExecution();
	});	

	document.getElementById("pointreadbutton").addEventListener("click", function(){
		ClearExecutionMetrics();
		PointRead();
	});

	document.getElementById("QueryOptionsButton").addEventListener("click", function(){
		document.getElementById("queryoptionsbox").showModal();
	});

	document.getElementById("connectBycstring").addEventListener("change", function() {		
		if (document.getElementById("connectBycstring").checked){
			document.getElementById("cstringtxt").disabled = false;
		} else{
			document.getElementById("cstringtxt").disabled = true;
		}
	});	

	document.getElementById("ConnectButton").addEventListener("click", function(){
		var cstring = document.getElementById("connectBycstring").checked;
		HandleConnection(cstring);		
	});

	document.getElementById("OverallLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		HandleInfoBoxes(dest);		
	});

	document.getElementById("ExecutionMetricsLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		HandleInfoBoxes(dest);
	});

	document.getElementById("IndexinPolicyLink").addEventListener("click", function(){
		var dest = this.getAttribute('data-destination');
		HandleInfoBoxes(dest);
	});	
	
	document.getElementById("cosmosdblist").addEventListener("change", function(){
		var current = document.getElementById('cosmosdblist').value;
		document.getElementById('cosmosdbpkeyname').innerHTML = 'Partition Key:';
		DbChanged(current);
	});		

	document.getElementById("cosmoscontainers").addEventListener("change", function(){
		ContainerChanged(this.value);
	});
	</script>
	</body>
	</html>`;
};

async function CreateNewDatabase(name){
	try{
		const {database} = await client.databases.createIfNotExists({id: name});
		vscode.window.showInformationMessage(database.id + ' is created.');
		return database;
	}
	catch(error){
		vscode.window.showErrorMessage(error);
	}	
};

async function ExecuteQuery(dbname, containerid, query, options){
	const container = cosmosClient.database(dbname).container(containerid);	
	const queryIterator = container.items.query(query, options);
	let count = 0;
	var cosmosResponse ={
		result:[],
		queryMetrics:[],
		charge:0,
		count:0,
		hasError: false,
		error: '',
		qm:{
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
			vmExecutionTime:0
		}
	};
	try{
	while (queryIterator.hasMoreResults() && count <= 100000) {	
		const resources = await queryIterator.fetchNext();
		cosmosResponse.charge += Number(resources.headers['x-ms-request-charge']);
		cosmosResponse.result = cosmosResponse.result.concat(resources.resources);		
		if (resources.queryMetrics[0]){			
			cosmosResponse.queryMetrics.push(resources.queryMetrics[0]);
		}
	}
	for (var q=0;q<cosmosResponse.queryMetrics.length; q++){
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
	cosmosResponse.qm.outputDocumentSize = await formatBytes(cosmosResponse.qm.outputDocumentSize);
	cosmosResponse.qm.retrievedDocumentSize = await formatBytes(cosmosResponse.qm.retrievedDocumentSize);
	cosmosResponse.count = cosmosResponse.result.length;
	return cosmosResponse;
}
	catch(e){
		cosmosResponse.hasError = true;
		cosmosResponse.error = await HandleErrorTxt(e.message);		
		return cosmosResponse;
	}
};

async function HandleErrorTxt(message){
	try{
		var custom = message.replace("Message: ","");
		custom = custom.slice(0, custom.indexOf('\r'));
		return JSON.parse(custom);
	}
	catch (e){
		return message;
	}	
}

async function PointRead(dbname, containerid, pkey, id){
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

};

async function formatBytes(bytes,decimals =2){
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const dm = decimals <0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB','GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k,i)).toFixed(dm))+ ' ' + sizes[i];
};

async function ReadPartitions(){
	//await cosmosArmClient.ReadPartitionKeyRangeFeedAsync()
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};