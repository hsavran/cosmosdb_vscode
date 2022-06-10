var containers=[];
var dbAccounts=[];
var queryOptions = {
	populateQueryMetrics :false,
	maxItemCount: undefined
};
var currentConnType = "";
var myChart;

function ExecuteQuery(querytxt){
	var db = document.getElementById('cosmosdblist').value;
    var container = document.getElementById('cosmoscontainers').value;
	if (db == "-1" || container == "-1"){
		DisplayErrorBox("Please select a database and container to continue.");
	}
	else if (querytxt.length && querytxt.length > 10){
		document.getElementById('loadingquerybox').showModal();
		GetQueryOptions();
		vscode.postMessage({
			command: 'execute',
			conf: {db:db, cont:container, q:querytxt, options: queryOptions}
		});
		if (myChart){
			myChart.destroy();
		}
	} else{
		document.getElementById('loadingquerybox').close();
		DisplayErrorBox("Invalid Query");
	}
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
	queryOptions.forceQueryPlan = document.getElementById('optionForceQPlan').checked;
	queryOptions.maxDegreeOfParallelism = Number(document.getElementById('optionParellelism').value);
	queryOptions.populateIndexingMetrics = document.getElementById('optionEnableIndexingMetrics').checked;
	var maxitemcount = Number(document.getElementById('optionMaxItemCount').value);
	if (maxitemcount > 0){
		queryOptions.maxItemCount = maxitemcount;
	} else {
		queryOptions.maxItemCount = undefined;
	}
	
	//queryOptions.consistencyPolicy = "Eventual";
	//queryOptions.populateQuotaInfo =true;	
}

function ClearIndexingPolicy(){
	document.getElementById("indexingMode").textContent = '';
	document.getElementById("excludedPaths").innerHTML ='';
	document.getElementById("includedPaths").innerHTML ='';
	document.getElementById("spatialIndexes").innerHTML ='';
	document.getElementById("compositePaths").innerHTML ='';
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
		df.value = '-1';
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
		document.getElementById("PartitionListButton").disabled = false;
	} else{
		document.getElementById('cosmosdbpkeyname').innerHTML = 'Partition Key:';
		document.getElementById("PartitionListButton").disabled = true;
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
	if (pol.excludedPaths){
		for(var e=0; e<pol.excludedPaths.length; e++){
			var sp = document.createElement('div');
			sp.classList.add('alignright');
			sp.textContent = pol.excludedPaths[e].path;
			document.getElementById('excludedPaths').appendChild(sp);
		}
	}
	if (pol.includedPaths){
		for(var i=0; i<pol.includedPaths.length; i++){
			var sp = document.createElement('div');
			sp.classList.add('alignright');
			sp.textContent = pol.includedPaths[i].path;
			document.getElementById('includedPaths').appendChild(sp);
		}
	}
	if (pol.compositeIndexes){
		for(var i=0; i<pol.compositeIndexes.length; i++){
			var holder = document.createElement('div');
			holder.classList.add('compositeIndexholder');
			for (var t=0; t<pol.compositeIndexes[i].length; t++){
				var cholder = document.createElement('div');
				cholder.classList.add('compositeindexitem');
				var pth = document.createElement('div');
				var ord = document.createElement('div');
				ord.classList.add('compositeindexitemorder');
				pth.textContent = pol.compositeIndexes[i][t].path;
				var order = "ASC";
				if (pol.compositeIndexes[i][t].order === 'descending'){
					order = "DESC";
				}
				ord.textContent = order;
				cholder.appendChild(pth);
				cholder.appendChild(ord);
				holder.appendChild(cholder);
				document.getElementById('compositePaths').appendChild(holder);
			}			
		}
	}
	if (pol.spatialIndexes){
		for(var e=0; e<pol.spatialIndexes.length; e++){
			var sp = document.createElement('div');
			sp.classList.add('alignright');
			sp.textContent = pol.spatialIndexes[e].path;
			document.getElementById('spatialIndexes').appendChild(sp);
		}
	}
};

function RenderDbOverall(dbname){
	var dbinfo = dbAccounts.filter(function(val){
		return val.name == dbname;
	});
	if (dbinfo){
		document.getElementById("regiontxt").textContent = dbinfo[0].location || "";
		document.getElementById("failovertxt").textContent = dbinfo[0].enableAutomaticFailover || "";
		if (dbinfo[0].consistencyPolicy){
			document.getElementById("consistencytxt").textContent = dbinfo[0].consistencyPolicy.defaultConsistencyLevel || "";
		} else{
			document.getElementById("consistencytxt").textContent = "";
		}
		
		document.getElementById("analyticalstoragetxt").textContent = dbinfo[0].enableAnalyticalStorage || "";
		document.getElementById("freetiertxt").textContent = dbinfo[0].enableFreeTier || "";
		if (dbinfo[0].backupPolicy){
			document.getElementById("backuptypetxt").textContent = dbinfo[0].backupPolicy.type || "";
		} else{
			document.getElementById("backuptypetxt").textContent = "";
		}
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

function FindPhysicalPartitions(db, container){
	if (db && container){
	vscode.postMessage({
		command: 'findpartitions',
		conf: {db:db, cont:container}
	});
}
};

function DisplayPhysicalPartitions(data){	
	if (data && data.PartitionKeyRanges){		
		document.getElementById("physicalpartitionsdialog").showModal();
		var rows = document.getElementById('partitionlistrows');
		while (rows.hasChildNodes()){
			rows.removeChild(rows.lastChild);
		}
		for (var i=0; i<data.PartitionKeyRanges.length; i++){
			var tr = document.createElement('tr');

			var pid = document.createElement('td');			
			var pidtxt = document.createTextNode(data.PartitionKeyRanges[i].id);
			pid.appendChild(pidtxt);
			tr.appendChild(pid);

			var status = document.createElement('td');
			var statustxt = document.createTextNode(data.PartitionKeyRanges[i].status);
			status.appendChild(statustxt);
			tr.appendChild(status);

			var min = document.createElement('td');
			var mintxt = document.createTextNode(data.PartitionKeyRanges[i].minInclusive);
			min.appendChild(mintxt);
			tr.appendChild(min);

			var max = document.createElement('td');
			var maxtxt = document.createTextNode(data.PartitionKeyRanges[i].maxExclusive);
			max.appendChild(maxtxt);
			tr.appendChild(max);

			var thr = document.createElement('td');
			var thrtxt = document.createTextNode(data.PartitionKeyRanges[i].throughputFraction);
			thr.appendChild(thrtxt);
			tr.appendChild(thr);			
			rows.appendChild(tr);
		}
	}	
}

function CreateIndexingMetricItemBox(data, itype)
{	
	var box = document.createElement('div');
		box.classList.add("indexingmetricitembox");
		var indextype = document.createElement('div');
		indextype.classList.add("indexingmetricitemindicator");
		indextype.classList.add("greengradient1")
		indextype.innerHTML= itype;
		var txt = document.createElement("div");
		txt.classList.add("indexingmetricstext");
		if (data.IndexSpecs){
			for (var i=0; i<data.IndexSpecs.length; i++){
				var temp = document.createElement("div");
				temp.innerHTML = data.IndexSpecs[i];
				txt.append(temp);
			}
		} else {
			txt.innerHTML = data.IndexSpec;
		}		
		var grade = document.createElement("div");
		grade.classList.add("indexingmetricitemindicator");
		grade.classList.add("redgradient1");
		grade.innerHTML = data.IndexImpactScore;
		box.appendChild(indextype);
		box.appendChild(txt);
		box.appendChild(grade);
		return box;		
}

function CreateIndexingMetricItemRow(data, itype){
	var tr = document.createElement('tr');					
	var ityp = document.createElement('td');
	var typtxt = document.createTextNode(itype);
	ityp.appendChild(typtxt);
	tr.appendChild(ityp);

	var ipath = document.createElement('td');
	var txt = document.createElement("div");
	if (data.IndexSpecs){
		for (var i=0; i<data.IndexSpecs.length; i++){
			var temp = document.createElement("div");
			temp.innerHTML = data.IndexSpecs[i];
			txt.append(temp);
		}
	} else {
		txt.innerHTML = data.IndexSpec;
	}
	ipath.appendChild(txt);	
	tr.appendChild(ipath);

	var iflag = document.createElement('td');
	var flgtxt = document.createTextNode(data.IndexImpactScore);
	iflag.appendChild(flgtxt);
	tr.appendChild(iflag);
	return tr;	
}

function DisplayIndexingMetrics(data){	
	//var utilized = document.getElementById("UtilizedIndexes");
	//var potential = document.getElementById("PotentialIndexes");
	//utilized.innerHTML = '';
	//potential.innerHTML='';
	var utilizedtable = document.getElementById('UtilizedIndexesTable');
	var potentialtable = document.getElementById('PotentialIndexesTable');
	utilizedtable.innerHTML = '';
	potentialtable.innerHTML = '';
	if (data.UtilizedSingleIndexes.length > 0){
		for(var i=0; i<data.UtilizedSingleIndexes.length; i++){
			//var box = CreateIndexingMetricItemBox(data.UtilizedSingleIndexes[i], "Single");
			var tr = CreateIndexingMetricItemRow(data.UtilizedSingleIndexes[i], "Single");
			//if (box){
				//utilized.appendChild(box);
			//}
			if (tr){
				utilizedtable.appendChild(tr);
			}
		}
	}
	if (data.UtilizedCompositeIndexes.length > 0){
		for(var i=0; i<data.UtilizedCompositeIndexes.length; i++){
			//var box = CreateIndexingMetricItemBox(data.UtilizedCompositeIndexes[i], "Composite");
			var tr = CreateIndexingMetricItemRow(data.UtilizedCompositeIndexes[i], "Composite");
			//if (box){
				//utilized.appendChild(box);
			//}
			if (tr){
				utilizedtable.appendChild(tr);
			}
		}
	}
	if (data.PotentialSingleIndexes.length > 0){
		for(var i=0; i<data.PotentialSingleIndexes.length; i++){
			//var box = CreateIndexingMetricItemBox(data.PotentialSingleIndexes[i], "Single");
			var tr = CreateIndexingMetricItemRow(data.PotentialSingleIndexes[i], "Single");
			//if (box){
				//potential.appendChild(box);
			//}
			if (tr){
				potentialtable.appendChild(tr);
			}
		}
	}
	if (data.PotentialCompositeIndexes.length > 0){
		for(var i=0; i<data.PotentialCompositeIndexes.length; i++){
			//var box = CreateIndexingMetricItemBox(data.PotentialCompositeIndexes[i], "Composite");
			var tr = CreateIndexingMetricItemRow(data.PotentialCompositeIndexes[i], "Composite");
			//if (box){
				//potential.appendChild(box);
			//}
			if (tr){
				potentialtable.appendChild(tr);
			}
		}
	}



}

function DisplayErrorBox(msg, code, severity,location){
	document.getElementById("errorbox").showModal();	
	document.getElementById("errorCode").textContent = code || "";
	document.getElementById("errorSeverity").textContent = severity || "";
	if (location){
		document.getElementById("errorLoc").textContent = 'Starts : ' + location.start + ' Ends : ' + location.end; 
	} else {
		document.getElementById("errorLoc").textContent = "";
	}
	document.getElementById("errortxt").textContent = msg || "Error occured";
}

function DisplayOnMap(data){
	var propname = document.getElementById('spatialprop').value;
	var drawname = document.getElementById('spatialpropdraw').value;
	var style = {
		"color": "#ff7800",
		"weight": 1
	};	
 for (var x=0;x<data.length;x++){
	 try{		
		 var val = getDepthValue(data[x],drawname);
		 var result = L.geoJSON(val, {
			 style: style,
			 onEachFeature: function(feature,layer){
				 feature.properties = data[x];
				 layer.bindPopup("<b>id: </b>" + data[x].id);
			 }

		 });
		 var layerGroup = new L.LayerGroup();
		 layerGroup.addTo(cosmosmap);
		 layerGroup.addLayer(result);
		 drawnItems.addLayer(layerGroup);
		 //layerGroup.removeLayer(result);
	 }
	 catch(e)
	 {}
 }
}

function RemoveItemsFromMap(event){
	cosmosmap.eachLayer(function(l){
		if (l.feature && l.feature.properties){
			cosmosmap.removeLayer(l);
		}
	});
}

function AddItemToMap(event,drawnItems){
	var layer = event.layer;
	if (event.layerType == 'rectangle'){
		layer._latlngs[0] = layer._latlngs[0].reverse();
	}
	drawnItems.addLayer(layer);

	var propname = document.getElementById('spatialprop').value;
	var displayit = document.getElementById('optionDisplaySpatialQ').checked;
	var topx = document.getElementById('maxspatialreturn').value;
	if (!Number(topx)){
		topx = '100';
	}
	var cmd = "SELECT TOP " + topx + " * FROM c WHERE ST_WITHIN(c." + propname + ", " + JSON.stringify(layer.toGeoJSON().geometry) + ")";
	ExecuteQuery(cmd);
	if (displayit){
		var session = editor.session;
		session.insert({
			row: session.getLength(),
			column:0
		}, "\n" + cmd);	
	}
	console.log(cmd);
}

function getDepthValue(obj, path, defaultValue) {
	let props;
	if (typeof obj === "undefined") return defaultValue;
	if (typeof path  === "string") {
	  props = path.split(".").reverse();
	} else {
	  props = path;
	} 
	if (path.length === 0) return obj || defaultValue;
	let current = props.pop();
	return getDepthValue(obj[current], props, defaultValue);
  }

function RenderQueryResults(data){
	//debugger;
	if (data && data.length){
		var schema = Object.keys(data[0]);
		if (schema){
			var slc = document.getElementById("schemalist");
			var slc2 = document.getElementById("timelineschemalist");
			slc.innerHTML =  "";
			slc2.innerHTML =  "";
			for (var x=0; x<schema.length; x++){				
				slc.appendChild(CreateOption(schema[x]));
				slc2.appendChild(CreateOption(schema[x]));
			}
		}
	}
	
		document.getElementById("queryresults").innerHTML ='';
		var thm = '';
		var theme = document.getElementById("darkmodeToggle").dataset.flag;	
		if (theme == '1'){
		thm = 'dark';
		}	  
		resultbox = new JSONFormatter(data,2,{theme:thm, hoverPreviewEnabled:true});
	  	document.getElementById("queryresults").appendChild(resultbox.render());	
	};

	function CreateOption(txt,val){
		var opt = document.createElement('option');
		opt.innerHTML = txt;
		if (!val){
			val = txt;
		}
		opt.value = val;		
		return opt;
	}

function TestChart(){
	var propname = document.getElementById("schemalist").value;
	var tline = document.getElementById("timelineschemalist").value;
	var charttype = document.querySelector('input[name="charttype"]:checked').value;	
	const ctx = document.getElementById('testchart').getContext('2d');
	//debugger;	
	var data2 = currentdata.map((element)=>{
		if (!isNaN(element[propname]) && typeof element[propname] === 'number'){
		return element[propname];
		} else {
			return 0;
		}
	});
	var labels = data2;
	if (tline){
		labels = currentdata.map((element)=>{
			
			return element[tline];			
		});
	}
	var min = Math.min(...data2);
	document.getElementById("analyzemin").innerHTML = min;
	var max = Math.max(...data2);
	document.getElementById("analyzemax").innerHTML = max;
	var avg = data2.reduce((a,b)=>a+b,0)/data2.length;
	document.getElementById("analyzeavg").innerHTML = avg.toFixed(2);
	if (myChart){
		myChart.destroy();
	}
	myChart = new Chart(ctx, {
		type: charttype,
		data: {			
			labels: labels,
			datasets: [{
				label: propname,
				data: data2,
				backgroundColor: CreateColors(data2.length),
				borderColor: 'gray',
				borderWidth: 1				
			}]
		},		
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend:{
					display:false
				}
			}			
		}
	});
};

function CreateRandomColor(){
	var r = Math.floor(Math.random() * 255);
	var g = Math.floor(Math.random() * 255);
	var b = Math.floor(Math.random() * 255);
	return "rgba(" + r + "," + g + "," +b + ",0.5)";
}

function CreateColors(number){
	var pool =[];
	for (var i =0; i <number; i++){
		pool.push(CreateRandomColor());
	}
	return pool;
}


	
window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'load':
			document.getElementById('loadingquerybox').close();
			//var result =JSON.stringify(message.response.result[0],null,2);
			if (!message.response.hasError)
			{
				DisplayOnMap(message.response.result);
				document.getElementById("queryrequnit").textContent = message.response.charge.toFixed(2);            
				RenderQueryResults(message.response.result);
				//document.getElementById("queryresults").innerHTML ='';
				//var temp = new JSONFormatter(message.response.result,2,{theme:'dark', hoverPreviewEnabled:true});
				currentdata = message.response.result;
				//resultbox = new JSONFormatter(message.response.result,2,{theme:'dark', hoverPreviewEnabled:true});
				//document.getElementById("queryresults").appendChild(resultbox.render());
				document.getElementById("numberOfPartitions").textContent = message.response.qm.numberofpartition;
				document.getElementById("queryitemcount").textContent =message.response.result.length;
				document.getElementById("documentLoadTime").textContent = message.response.qm.documentLoadTime.toFixed(2);
				document.getElementById("documentWriteTime").textContent = message.response.qm.documentWriteTime.toFixed(2);
				document.getElementById("indexHitDocumentCount").textContent = message.response.qm.indexHitDocumentCount;
				document.getElementById("outputDocumentCount").textContent = message.response.qm.outputDocumentCount;
				document.getElementById("outputDocumentSize").textContent = message.response.qm.outputDocumentSize;
				document.getElementById("totalQueryExecutionTime").textContent = message.response.qm.totalQueryExecutionTime.toFixed(2);
				document.getElementById("logicalPlanBuildTime").textContent = message.response.qm.queryPreparationTimes.logicalPlanBuildTime.toFixed(2);
				document.getElementById("physicalPlanBuildTime").textContent = message.response.qm.queryPreparationTimes.physicalPlanBuildTime.toFixed(2);
				document.getElementById("queryCompilationTime").textContent = message.response.qm.queryPreparationTimes.queryCompilationTime.toFixed(2);
				document.getElementById("queryOptimizationTime").textContent = message.response.qm.queryPreparationTimes.queryOptimizationTime.toFixed(2);
				document.getElementById("retrievedDocumentSize").textContent = message.response.qm.retrievedDocumentSize;
				document.getElementById("retrievedDocumentCount").textContent = message.response.qm.retrievedDocumentCount;			
				document.getElementById("queryEngineExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.queryEngineExecutionTime.toFixed(2);
				document.getElementById("systemFunctionExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.systemFunctionExecutionTime.toFixed(2);
				document.getElementById("userDefinedFunctionExecutionTime").textContent = message.response.qm.runtimeExecutionTimes.userDefinedFunctionExecutionTime.toFixed(2);
				document.getElementById("totalQueryExecutionTime").textContent = message.response.qm.totalQueryExecutionTime.toFixed(2);
				document.getElementById("vmExecutionTime").textContent = message.response.qm.vmExecutionTime.toFixed(2);
				var rows = document.getElementById('partitionmetricsrows');
				if (message.response.indexingMetrics){
					DisplayIndexingMetrics(message.response.indexingMetrics);
				}
				while (rows.hasChildNodes()){
					rows.removeChild(rows.lastChild);
				}
				if (message.response.qms.length > 1){
					document.getElementById("numberOfPartitions").classList.add('partitionexecutionmetriclink');
				} else{
					document.getElementById("numberOfPartitions").classList.remove('partitionexecutionmetriclink');
				}
				for (var qm=0; qm < message.response.qms.length; qm++){
					var tr = document.createElement('tr');
					
					var pid = document.createElement('td');
					var pidtxt = document.createTextNode(message.response.qms[qm].partitionid);
					pid.appendChild(pidtxt);
					tr.appendChild(pid);

					var rdoc = document.createElement('td');
					var rdoctxt = document.createTextNode(message.response.qms[qm].retrievedDocumentCount);
					rdoc.appendChild(rdoctxt);
					tr.appendChild(rdoc);

					var rsize = document.createElement('td');
					var rsizetxt = document.createTextNode(message.response.qms[qm].retrievedDocumentSize);
					rsize.appendChild(rsizetxt);
					tr.appendChild(rsize);

					var qe = document.createElement('td');
					var qetxt = document.createTextNode(message.response.qms[qm].totalQueryExecutionTime.toFixed(2) + ' ms');
					qe.appendChild(qetxt);
					tr.appendChild(qe);

					var dload = document.createElement('td');
					var dloadtxt = document.createTextNode(message.response.qms[qm].documentLoadTime.toFixed(2) + ' ms');
					dload.appendChild(dloadtxt);
					tr.appendChild(dload);

					var etime = document.createElement('td');
					var etimetxt = document.createTextNode(message.response.qms[qm].vmExecutionTime.toFixed(2) + ' ms');
					etime.appendChild(etimetxt);
					tr.appendChild(etime);

					var ru = document.createElement('td');
					var rutxt = document.createTextNode(message.response.qms[qm].requestUnits);
					ru.appendChild(rutxt);
					tr.appendChild(ru);
					var dest = document.getElementById('partitionmetricsrows');
					dest.appendChild(tr);
				}				
			} else {				
				if (message.response.error){
					var msg;
					if (message.response.error.errors){
						msg = message.response.error.errors[0];
						DisplayErrorBox(msg.message, msg.code, msg.severity, msg.location);
					}
					else if(message.response.error.Errors){
					var msg = message.response.error.Errors[0];
					DisplayErrorBox(msg);
				}
					
					/*document.getElementById("errorbox").showModal();
					document.getElementById("errorCode").textContent = message.response.error.errors[0].code;
					document.getElementById("errorSeverity").textContent = message.response.error.errors[0].severity;
					document.getElementById("errorLoc").textContent = 'Starts : ' + message.response.error.errors[0].location.start + ' Ends : ' + message.response.error.errors[0].location.end; 
					document.getElementById("errortxt").textContent = message.response.error.errors[0].message;
					var Range = ace.require("ace/range").Range;
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
		case 'authfail':
			document.getElementsById('authError').style.display ='block';
			break;
		case 'physicalpartitions':			
			DisplayPhysicalPartitions(message.jsonData);			
			break;
		}
});

document.onkeydown = fkey;
document.onkeyup = fkey;

function fkey(e){
	e = e || window.event;
	if (e.keyCode == 116){
		HandleQueryExecution();
	}
}