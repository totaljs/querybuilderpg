# Total.js QueryBuilder: PostgreSQL

A simple QueryBuilder integrator for PostgreSQL database.

- [Documentation](https://docs.totaljs.com/total4/pzbr001pr41d/)
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
DATA.find('tbl_user').where('id', 1234).callback(console.log);
```

## Autoquery for JSON columns

`QueryBuilder.autoqueryjson($, column, schema, [defsort], [maxlimit])` works like `autoquery()` but the properties are read from a JSON or JSONB column. It supports the filtering, sorting, fields and pagination of `autoquery()`.

```js
// $ {Controller|Object} uses $.query (or the object itself)
// column {String} a name of the JSON column
// schema {String} properties and types, e.g. 'id,name,age:Number'
// defsort {String} default sorting, e.g. 'age_desc' (optional)
// maxlimit {Number} max. items per page, it enables the pagination (optional)

DATA.list('tbl_user').autoqueryjson($, 'data', 'id,name,email,age:Number,ok:Boolean,dtcreated:Date,tags:[string]', 'dtcreated_desc', 100).callback($.callback);
```

- Query string: `?age=>18&name=john&tags=a,b&sort=age_desc&fields=name,age&page=2&limit=20`
- Filters use the same rules as `autoquery()` (`a - b` range, `a,b` list, `>` and `<`, `=` exact, `today`...)
- Only properties declared in the `schema` can be used in fields, filters and sorting
- A property without a type is `String`
- The names of the column and properties accept only `a-z`, `0-9` and `_`

__Types and values__:

| Type | Result | Missing property | Value in a wrong format |
|------|--------|------------------|-------------------------|
| `String` | text | `null` | the value as text |
| `Number` | number | `null` | `0` |
| `Boolean` | boolean | `null` | `false` (`true`, `1`, `on`, `yes` are `true`) |
| `Date` | date | `null` | `null` |
| `[string]` | array | `null` | `[]` |

A value in a wrong format never fails the query (e.g. `"age": "abc"` is `0`), the same way as in `autoquery()`. This applies to filtering, sorting and to the returned values.

__Generated SQL__ (`?age=>18&sort=age_desc&fields=name,age`):

```sql
SELECT "data"->>'name' AS "name", to_jsonb(CASE ... END) AS "age" FROM tbl_user
WHERE (CASE ... END)>18 ORDER BY (CASE ... END) DESC
```

The QueryBuilder doesn't generate SQL for JSON columns. It uses a neutral name `json:column:property:type` and each adapter translates it into its own SQL, so the same code works with other databases when their adapter supports it.

## Connection string attributes

- Connection string example: `postgresql://user:password@localhost:5432/database?schema=parking&pooling=2`

---

- `schema=String` sets a default DB schema
- `pooling=Number` sets a default pooling (it overwrites pooling)