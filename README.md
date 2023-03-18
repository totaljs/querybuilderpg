# Total.js QueryBuilder: PostgreSQL

A simple QueryBuilder integrator for PostgreSQL database.

- [Documentation](https://docs.totaljs.com/total4/)
- `$ npm install querybuilderpg`

## Initialization

- Example: `postgresql://user:password@localhost:5432/database`

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

## Views

__BETA__ version. Views are used to create reports from the PG database according to dynamic filters. You can create a client-side interface for generating various reports from predefined views.

__Register view__:

```js
var view = PG_VIEWS.create({
	id: 'investments',
	name: 'Investments',
	sql: "SELECT a.value, TO_CHAR(a.dtcreated, 'yyyy')::int4 AS created, b.name AS username, b.email AS useremail, b.phone AS userphone, c.name AS projectname FROM tbl_investment a LEFT JOIN tbl_user b ON b.id=a.userid LEFT JOIN tbl_project c ON c.id=a.projectid LIMIT 10",
	fields: [
		{ id: 'x1', column: 'value', name: 'Amount', type: 'number', group: true },
		{ id: 'x2', column: 'created', name: 'Created', type: 'number' },
		{ id: 'x3', column: 'username', name: 'User --> name', type: 'string', group: true },
		{ id: 'x4', column: 'useremail', name: 'User --> email', type: 'string', group: true },
		{ id: 'x5', column: 'userphone', name: 'User --> phone', type: 'string', group: true },
		{ id: 'x6', column: 'projectname', name: 'Project --> name', type: 'string', group: true }
	],
});
```

- `view.export()` returns a safe object for the client-side
- `PG_VIEWS.create(metadata)` creates a view
- `PG_VIEWS.read('id')` returns a specific view
- `PG_VIEWS.remove(id)` removes view
- `PG_VIEWS.export()` exports views for the client-side

__Usage__:

```js
var filter = {};

// filter.group = ['x6'];
// filter.fields = [{ id: 'x1' }, { id: 'x2', type: 'max' }];
filter.fields = [{ id: 'x1' }, { id: 'x2' }];
filter.filter = [{ id: 'x1', type: 'between', value: '300000 - 350000' }];

filter.sort = [{ id: 'x1', type: 'desc' }];
// filter.filter = [{ id: 'x2', type: '=', value: '2022' }];
filter.limit = 5;
// filter.page = 2;

view.exec(filter, console.log);
```