# Total.js QueryBuilder: PostgreSQL

A simple QueryBuilder integrator for PostgreSQL database.

- [Documentation](https://docs.totaljs.com/total4/)

__Initialization__:

```js
// require('querybuilderpg').init(name, connectionstring, pooling);
// name {String} a name of DB (default: "default")
// connectionstring {String} a connection to the PostgreSQL
// pooling {Number} max. clients (default: "0" (disabled))
//
require('querybuilderpg').init('default', CONF.database);
// require('querybuilderpg').init('default', CONF.database, 10);
```

__Usage__:

```js
DB().find('tbl_user').where('id', 1234).callback(console.log);
// DB('default').find('tbl_user').where('id', 1234).callback(console.log);
```