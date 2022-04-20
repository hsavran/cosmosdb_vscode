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