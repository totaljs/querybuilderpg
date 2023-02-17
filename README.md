# Total.js QueryBuilder: PostgreSQL

A simple QueryBuilder integrator for PostgreSQL database.

- [Documentation](https://docs.totaljs.com/total4/)
- `$ npm install querybuilderpg`

## Initialization

- Connection string example: `postgresql://user:password@localhost:5432/database`

```js
// require('querybuilderpg').init(name, connectionstring, pooling, [errorhandling]);
// name {String} a name of DB (default: "default")
// connectionstring {String} a connection to the PostgreSQL
// pooling {Number} max. clients (default: "0" (disabled))
// errorhandling {Function(err, cmd)}

require('querybuilderpg').init('default', CONF.database);
// require('querybuilderpg').init('default', CONF.database, 10);
```

__Usage__:

```js
DB().find('tbl_user').where('id', 1234).callback(console.log);
// DB('default').find('tbl_user').where('id', 1234).callback(console.log);
```

## Connection string attributes

- Connection string example: `postgresql://user:password@localhost:5432/database?schema=parking&pooling=2`

---

- `schema=String` sets a default DB schema
- `pooling=Number` sets a default pooling (it overwrites pooling)