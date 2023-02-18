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
	from: 'tbl_investment a',
	fields: [
		{ id: 'x1', column: 'a.value', as: 'value', name: 'Amount', type: 'number' },
		{ id: 'x2', column: 'TO_CHAR(a.dtcreated, \'yyyy\')::int4', as: 'created', name: 'Created', type: 'number' },
		{ id: 'x3', column: 'b.name', as: 'username', name: 'User --> name', type: 'string' },
		{ id: 'x4', column: 'b.email', as: 'useremail', name: 'User --> email', type: 'string' },
		{ id: 'x5', column: 'b.phone', as: 'userphone', name: 'User --> phone', type: 'string' },
		{ id: 'x6', column: 'c.name', as: 'projectname', name: 'Project --> name', type: 'string' }
	],
	relations: [
		{ id: 'tbl_user b', type: 'LEFT', on: 'b.id=a.userid' },
		{ id: 'tbl_project c', type: 'LEFT', on: 'c.id=a.projectid' }
	]
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