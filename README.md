# Cosmos DB SQL Studio (Preview)

You can query Azure Cosmos DB SQL API by using VS Code now. Extension displays Execution Metrics, Indexing Policies and Overall Information about selected database and container.

![Cosmos DB SQL Studio](https://github.com/hsavran/CosmosDB/raw/master/azuresqleditor.gif)

## Features

* Connect to Cosmos DB SQL API by using token or connection string.
* Query Azure Cosmos DB SQL API
* Point Read by using Partition Key and Id
* Query Options support
* Display Request Unit Charge
* Display Query Execution Plan
* Display Selected Container's Indexing Policy
* Display Selected Database and Container's overall information. (works only with token connection)
    * Container's Partition Keys
    * Container's Unique Keys
    * Container's Conflict Policy
    * Database's Region
    * Database's Failover Policy
    * Database's Consistency Level
    * Analytical Storage information
    * Free Tier information
    * Database's Backup Type

![feature X](https://github.com/hsavran/CosmosDB/raw/master/overall.png)

## Release Notes

This is the first version of the tool. 
I hope you will enjoy to query Cosmos DB SQL API from VS Code.

### 0.0.1

* Initial release of Cosmos DB Studio.
* F5 Executes queries. VS Code environment menu comes up with F5 events too.

### 0.0.20
* Display number of physical partitions
* Display Execution metrics for each physical partition


![feature X](https://raw.githubusercontent.com/hsavran/CosmosDB/master/partmetrics.PNG)

### 0.0.22
* Force Query Plan option is added to the Options.
* List Physical Partitions functionality is added.

### 0.0.25
* Indexing Metrics is added to the Options

### 0.0.30
* Map view is added for Spatial Data types.
* Users can search by drawing Rectangle and Polygon on map.
* Spatial data type property should be defined in Option for Rectangle and Polygon search to work.

### 0.0.35
* Composite Indexes are added to Indexing Policy
* White Background mode is added to Query Results
* Indexing Metrics UI is redesigned
* Options are rearranged.

### 0.0.37
* Data Analyzer tab is added.
* Data Analyzer let user analyze the current data with basic charts and stats.

### 0.0.38
* Point Read functionality is moved to right side.
* Query Analyzer tab is added.
* Query Analyzer will track the queries, execution metrics and indexing metrics.
* Users can compare queries by Compare button.

### 0.0.39
* Style bugs fixed.

## 0.0.40
* Execution Metrics for Point Read bug is fixed.
* Index Lookup property bug is fixed.
* Query Analyzer seq remove bug is fixed.
* Query Analyzer Clear button bug is fixed.
* Red style is fixed for warning rows
* Index Hit Documents value is rounded to 2 decimals
* Indexing Metrics bug is fixed.