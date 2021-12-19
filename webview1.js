var containers=[];
var dbAccounts=[];
var queryOptions = {
	populateQueryMetrics :false
};
var currentConnType = "";

function ExecuteQuery(querytxt){
		GetQueryOptions();
        var db = document.getElementById('cosmosdblist').value;
        var container = document.getElementById('cosmoscontainers').value;        
		vscode.postMessage({
			command: 'execute',
			conf: {db:db, cont:container, q:querytxt, options: queryOptions}
		});
};

function PointRead(){
	var db = document.getElementById('cosmosdblist').value;
    var container = document.getElementById('cosmoscontainers').value;
	var id = document.getElementById('cosmosdbid').value;
	var pkey = document.getElementById('cosmosdbpkey').value;
	vscode.postMessage({
		command: 'pointread',
		conf: {id:id, pkey:pkey, db:db, cont:container}
	});
}
	
function AddDatabase(dbname){
	if (dbname){
		dbAccounts.push(dbname);	
		var slc = document.getElementById('cosmosdblist');	
		var opt = document.createElement('option');
		opt.value = dbname.name;
		opt.innerHTML = dbname.name;
		slc.appendChild(opt);
	}
}; 

function GetQueryOptions(){
	queryOptions.populateQueryMetrics = document.getElementById('optionEnableQM').checked;
	queryOptions.maxDegreeOfParallelism = Number(document.getElementById('optionParellelism').value);
	queryOptions.maxItemCount = Number(document.getElementById('optionMaxItemCount').value);	
}

function ClearIndexingPolicy(){
	document.getElementById("indexingMode").textContent = '';
	document.getElementById("excludedPaths").innerHTML ='';
	document.getElementById("includedPaths").innerHTML ='';
	document.getElementById("spatialIndexes").innerHTML ='';
}

function ClearExecutionMetrics(){
	document.getElementById("documentLoadTime").textContent = '';
	document.getElementById("documentWriteTime").textContent = '';
	document.getElementById("indexHitDocumentCount").textContent = '';
	document.getElementById("outputDocumentCount").textContent = '';
	document.getElementById("outputDocumentSize").textContent = '';
	document.getElementById("totalQueryExecutionTime").textContent = '';
	document.getElementById("logicalPlanBuildTime").textContent = '';
	document.getElementById("physicalPlanBuildTime").textContent = '';
	document.getElementById("queryCompilationTime").textContent = '';
	document.getElementById("queryOptimizationTime").textContent = '';
	document.getElementById("retrievedDocumentSize").textContent = '';
	document.getElementById("retrievedDocumentCount").textContent = '';			
	document.getElementById("queryEngineExecutionTime").textContent = '';
	document.getElementById("systemFunctionExecutionTime").textContent = '';
	document.getElementById("userDefinedFunctionExecutionTime").textContent = '';
	document.getElementById("totalQueryExecutionTime").textContent = '';
	document.getElementById("vmExecutionTime").textContent = '';
};

function DbChanged(dbname){
	if (dbname){		
		var slc = document.getElementById('cosmoscontainers');		
        slc.innerHTML =  "";
		var df = document.createElement('option');
		df.value = '0';
		df.innerHTML = 'Select One';
		slc.appendChild(df);
		var temp = containers.filter(function(val){
            return val.db == dbname;
        });
        for (var i=0;i<temp.length; i++){
            var opt = document.createElement('option');
			opt.dataset.pkey = temp[i].pkey;
			opt.value = temp[i].container;
			opt.innerHTML = temp[i].container;
			slc.appendChild(opt);
        }
		RenderDbOverall(dbname);
	}
};

function ContainerChanged(cname){
	if (cname != '0'){
		var selected = containers.filter(function(val){
			return val.container == cname;
		});
		if (selected){
			RenderContainerInfo(selected[0]);
			RenderIndexingPolicy(selected[0].indexing);
		}		
	} else{
		document.getElementById('cosmosdbpkeyname').innerHTML = 'Partition Key:';
	}
};

function RenderContainerInfo(cinfo){	
	document.getElementById('cosmosdbpkeyname').innerHTML = cinfo.pkey;
	document.getElementById("partkeytxt").textContent = cinfo.pkey;
	document.getElementById("uqkeytxt").textContent = cinfo.ukey;
	document.getElementById("conflicttxt").textContent = cinfo.conflict;
};

function RenderIndexingPolicy(pol){	
	ClearIndexingPolicy();		
	document.getElementById('indexingMode').textContent = pol.indexingMode;
	for(var e=0; e<pol.excludedPaths.length; e++){
		var sp = document.createElement('div');
		sp.classList.add('alignright');
		sp.textContent = pol.excludedPaths[e].path;
		document.getElementById('excludedPaths').appendChild(sp);
	}
	for(var i=0; i<pol.includedPaths.length; i++){
		var sp = document.createElement('div');
		sp.classList.add('alignright');
		sp.textContent = pol.includedPaths[i].path;
		document.getElementById('includedPaths').appendChild(sp);
	}
	for(var e=0; e<pol.spatialIndexes.length; e++){
		var sp = document.createElement('div');
		sp.classList.add('alignright');
		sp.textContent = pol.spatialIndexes[e].path;
		document.getElementById('spatialIndexes').appendChild(sp);
	}
};

function RenderDbOverall(dbname){
	var dbinfo = dbAccounts.filter(function(val){
		return val.name == dbname;
	});
	if (dbinfo){
		document.getElementById("regiontxt").textContent = dbinfo[0].location;
		document.getElementById("failovertxt").textContent = dbinfo[0].enableAutomaticFailover;
		document.getElementById("consistencytxt").textContent = dbinfo[0].consistencyPolicy.defaultConsistencyLevel;
		document.getElementById("analyticalstoragetxt").textContent = dbinfo[0].enableAnalyticalStorage;
		document.getElementById("freetiertxt").textContent = dbinfo[0].enableFreeTier;
		document.getElementById("backuptypetxt").textContent = dbinfo[0].backupPolicy.type;
	}
};

function HandleInfoBoxes(dest){
	var isOpen = document.getElementById(dest).style.display == 'block';
	var metrics = document.getElementsByClassName('MetricsBox');
	for (var i=0; i<metrics.length; i++){
		metrics.item(i).style.display='none';
	}	
	if (isOpen){
		document.getElementById("queryoptionresults").style.visibility = '';
		document.getElementById("queryoptionresults").style.display = 'none';
		document.getElementById(dest).style.display = 'none';

	} else {
		document.getElementById("queryoptionresults").style.visibility = 'visible';
		document.getElementById("queryoptionresults").style.display = 'block';
		document.getElementById(dest).style.display = 'block';
	}
};

function HandleConnection(connectyBycstring){
	if (connectyBycstring){
		document.getElementById("OverallLink").style.display = 'none';
		currentConnType = "cstring";
		var cstring = document.getElementById("cstringtxt").value;
		if (cstring){
			vscode.postMessage({
				command: 'cstring',
				conn: cstring
			});
		document.getElementById("connectionbox").close();
		}
	} else {
		document.getElementById("OverallLink").style.display = 'block';
		currentConnType = "token";
		document.getElementById("loadingbox").showModal();
		document.getElementById("connectionbox").close();
		vscode.postMessage({
			command: 'init',
			text: ''
		});	
	}
};

function HandleQueryExecution(){
	GetQueryOptions();
	ClearExecutionMetrics();
	var query = editor.getValue();
	var selected = editor.getSelectedText();
	if (selected.length){
		query = selected;
	}
	ExecuteQuery(query, queryOptions);
};
	
window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'load':
			//var result =JSON.stringify(message.response.result[0],null,2);
			if (!message.response.hasError)
			{
				document.getElementById("queryrequnit").textContent = message.response.charge;            
				document.getElementById("queryresults").innerHTML ='';
				var temp = new JSONFormatter(message.response.result,2,{theme:'dark', hoverPreviewEnabled:true});            
				document.getElementById("queryresults").appendChild(temp.render());
				document.getElementById("queryitemcount").textContent =message.response.result.length;
				document.getElementById("documentLoadTime").textContent = message.response.qm.documentLoadTime;
				document.getElementById("documentWriteTime").textContent = message.response.qm.documentWriteTime;
				document.getElementById("indexHitDocumentCount").textContent = message.response.qm.indexHitDocumentCount;
				document.getElementById("outputDocumentCount").textContent = message.response.qm.outputDocumentCount;
				document.getElementById("outputDocumentSize").textContent = message.response.qm.outputDocumentSize;
				document.getElementById("totalQueryExecutionTime").textContent = message.response.qm.totalQueryExecutionTime;
				document.getElementById("logicalPlanBuildTime").textContent = message.response.qm.queryPreparationTimes.logicalPlanBuildTime;
				document.getElementById("physicalPlanBuildTime").textContent = message.response.qm.queryPreparationTimes.physicalPlanBuildTime;
				document.getElementById("queryCompilationTime").textContent = message.response.qm.queryPreparationTimes.queryCompilationTime;
				document.getElementById("queryOptimizationTime").textContent = message.response.qm.queryPreparationTimes.queryOptimizationTime;
				document.getElementById("retrievedDocumentSize").textContent = message.response.qm.retrievedDocumentSize;
				document.getElementById("retrievedDocumentCount").textContent = message.response.qm.retrievedDocumentCount;			
				document.getElementById("queryEngineExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.queryEngineExecutionTime;
				document.getElementById("systemFunctionExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.systemFunctionExecutionTime;
				document.getElementById("userDefinedFunctionExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime;
				document.getElementById("totalQueryExecutionTime").textContent = message.response.qm.totalQueryExecutionTime;
				document.getElementById("vmExecutionTime").textContent = message.response.qm.vmExecutionTime;			
			} else {				
				if (message.response.error){
					document.getElementById("errorbox").showModal();
					document.getElementById("errorCode").textContent = message.response.error.errors[0].code;
					document.getElementById("errorSeverity").textContent = message.response.error.errors[0].severity;
					document.getElementById("errorLoc").textContent = 'Starts : ' + message.response.error.errors[0].location.start + ' Ends : ' + message.response.error.errors[0].location.end; 
					document.getElementById("errortxt").textContent = message.response.error.errors[0].message;
					/*var Range = ace.require("ace/range").Range;
					var range = new Range(0, message.response.error.errors[0].location.start, 1, message.response.error.errors[0].location.end);
					var marker = editor.getSession().addMarker(range,"ace_selected_word", "text");*/
				}
			}
			break;
    	case 'subCount':
			document.getElementById('countSub').innerHTML = message.jsonData;                    
			break;
		case 'resCount':
			var current = parseInt(document.getElementById('countRes').innerText);
			current = current + parseInt(message.jsonData);
	    	document.getElementById('countRes').innerHTML = current;
			break;
		case 'accCount':
			var current = parseInt(document.getElementById('countAcc').innerText);
			current = current + parseInt(message.jsonData);
			document.getElementById('countAcc').innerHTML = current;					
			break;
		case 'dbCount':
			var current = parseInt(document.getElementById('countDb').innerText);
			current = current + parseInt(message.jsonData);
			document.getElementById('countDb').innerHTML = current;
			break;
    	case 'contCount':
			var current = parseInt(document.getElementById('countCont').innerText);
			current = current + parseInt(message.jsonData);
			document.getElementById('countCont').innerHTML = current;
			document.getElementById("loadingbox").close();					
			break;
		case 'addDb':
			AddDatabase(message.jsonData);
			break;
		case 'addCon':
			containers.push(message.jsonData);					
			break;		
		}
});