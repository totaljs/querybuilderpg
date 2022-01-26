// Total.js Module: PostgreSQL integrator

const Pg = require('pg');
const POOLS = {};
const REG_PG_ESCAPE_1 = /'/g;
const REG_PG_ESCAPE_2 = /\\/g;

function exec(client, filter, callback, done) {

	var cmd;

	if (filter.exec === 'list') {
		cmd = makesql(filter);
		client.query(cmd.query, cmd.params, function(err, response) {
			if (err) {
				done();
				callback(err);
			} else {
				cmd = makesql(filter, 'count');
				client.query(cmd.query, cmd.params, function(err, counter) {
					done();
					callback(err, err ? null : { items: response.rows, count: +counter.rows[0].count });
				});
			}
		});
		return;
	}

	if (filter.upsert) {
		// update
		client.query(cmd.query, cmd.params, function(err, response) {

			if (err) {
				done();
				callback(err);
				return;
			}

			response = response.rows[0];

			if (response && response.count) {
				callback(null, response.count);
				return;
			}

			cmd = makesql(filter, 'insert');
			// insert
			client.query(cmd, cmd.params, function(err, response) {
				callback(err, err ? 0 : (response.rows && response.rows.length ? filter.primarykey ? response.rows[0][filter.primarykey] : 1 : 1));
			});

		});
		return;
	}

	cmd = makesql(filter);
	client.query(cmd.query, cmd.params, function(err, response) {

		done();

		if (err) {
			callback(null);
			return;
		}

		switch (filter.exec) {
			case 'insert':
				callback(null, response.rows[0][filter.primarykey] || 1);
				break;
			case 'update':
			case 'remove':
				callback(null, response.rows[0].count || 0);
				break;
			default:
				callback(err, response.rows);
				break;
		}
	});
}

function pg_where(where, filter, operator) {

	var tmp;

	for (var item of filter) {
		switch (item.type) {
			case 'or':
				var tmp = [];
				pg_where(tmp, item.value, 'OR');
				where.length && where.push(operator);
				where.push('(' + tmp.join(' ') + ')');
				break;
			case 'in':
				where.length && where.push(operator);
				where.push(item.name + ' IN (' + PG_ESCAPE(item.value) + ')');
				break;
			case 'query':
				where.length && where.push(operator);
				where.push('(' + item.value + ')');
				break;
			case 'notin':
				where.length && where.push(operator);
				where.push(item.name + ' NOT IN (' + PG_ESCAPE(item.value) + ')');
				break;
			case 'where':
				where.length && where.push(operator);
				where.push(item.name + item.comparer + PG_ESCAPE(item.value));
				break;
			case 'contains':
				where.length && where.push(operator);
				where.push('LENGTH(' + item.name +'::text)>0');
				break;
			case 'search':
				where.length && where.push(operator);
				tmp = item.value.replace(/%/g, '');
				if (item.operator === 'beg')
					where.push(item.name + ' ILIKE ' + PG_ESCAPE('%' + tmp));
				else if (item.operator === 'end')
					where.push(item.name + ' ILIKE ' + PG_ESCAPE(tmp + '%'));
				else
					where.push(item.name + ' ILIKE ' + PG_ESCAPE('%' + tmp + '%'));
				break;
			case 'month':
			case 'year':
			case 'day':
			case 'hour':
			case 'minute':
				where.length && where.push(operator);
				where.push('EXTRACT(' + item.type + ' from ' + item.name + ')' + item.comparer + PG_ESCAPE(item.value));
				break;
			case 'empty':
				where.length && where.push(operator);
				where.push('(' + item.name + ' IS NULL OR LENGTH(' + item.name + '::text)=0)');
				break;
			case 'between':
				where.length && where.push(operator);
				where.push('(' + item.name + ' BETWEEN ' + PG_ESCAPE(item.a) + ' AND ' + PG_ESCAPE(item.b) + ')');
				break;
		}
	}
}

function pg_insertupdate(filter, insert) {

	var query = [];
	var fields = insert ? [] : null;
	var params = [];

	for (var key in filter.payload) {
		var val = filter.payload[key];
		var c = key[0];
		switch (c) {
			case '-':
			case '+':
			case '*':
			case '/':
				key = key.substring(1);
				params.push(val ? val : 0);
				if (insert) {
					fields.push(key);
					query.push('$' + params.length);
				} else
					query.push('"' + key + '"=COALESCE(' + key + ',0)' + c + '$' + params.length);
				break;
			case '>':
			case '<':
				key = key.substring(1);
				params.push(val ? val : 0);
				if (insert) {
					fields.push(key);
					query.push('$' + params.length);
				} else
					query.push('"' + key + '"=' + (c === '>' ? 'GREATEST' : 'LEAST') + '(' + key + ',$' + params.length + ')');
				break;
			case '!':
				// toggle
				key = key.substring(1);
				if (insert) {
					fields.push(key);
					query.push('FALSE');
				} else
					query.push('"' + key + '"=NOT ' + key);
				break;
			case '=':
			case '#':
				// raw
				key = key.substring(1);
				if (insert) {
					if (c === '=') {
						fields.push(key);
						query.push(val);
					}
				} else
					query.push('"' + key + '"=' + val);
				break;
			default:
				params.push(val);
				if (insert) {
					fields.push(key);
					query.push('$' + params.length);
				} else
					query.push('"' + key.substring(1) + '"=$' + params.length);
				break;
		}
	}

	return { fields, query, params };
}

function makesql(opt, exec) {

	var query = '';
	var where = [];
	var model = {};
	var params;
	var index;
	var tmp;

	if (!exec)
		exec = opt.exec;

	pg_where(where, opt.filter, 'AND');

	switch (exec) {
		case 'find':
		case 'read':
			query = 'SELECT ' + (opt.fields || '*') + ' FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			break;
		case 'list':
			query = 'SELECT ' + (opt.fields || '*') + ' FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			break;
		case 'count':
			opt.first = true;
			query = 'SELECT COUNT(1)::int as count FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			break;
		case 'insert':
			tmp = pg_insertupdate(opt, true);
			query = 'INSERT INTO ' + opt.table + ' (' + tmp.fields.join(',') + ') VALUES(' + tmp.query.join(',') + ')' + (opt.primarykey ? ' RETURNING ' + opt.primarykey : '');
			params = tmp.params;
			break;
		case 'remove':
			query = 'DELETE FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			break;
		case 'update':
			tmp = pg_insertupdate(opt, true);
			query = 'WITH rows AS (UPDATE ' + opt.table + ' SET ' + tmp.query.join(',') + (where.length ? (' WHERE ' + where.join(' ')) : '') + ' RETURNING 1) SELECT COUNT(1)::int count FROM rows';
			params = tmp.params;
			break;
		case 'drop':
			query = 'DROP TABLE ' + opt.table;
			break;
		case 'truncate':
			query = 'TRUNCATE TABLE ' + opt.table + ' RESTART IDENTITY';
			break;
		case 'command':
			break;
		case 'scalar':
			switch (opt.scalar.type) {
				case 'avg':
				case 'min':
				case 'sum':
				case 'max':
				case 'count':
					opt.first = true;
					var val = opt.scalar.key === '*' ? 1 : opt.scalar.key;
					query = 'SELECT ' + opt.scalar.type.toUpperCase() + (opt.scalar.type !== 'count' ? ('(' + val + ')') : '(1)') + '::int as count FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
					break;
				case 'group':
					query = 'SELECT ' + opt.scalar.key + ', ' + (opt.scalar.key2 ? ('SUM(' + opt.scalar.key2 + ')::numeric') : 'COUNT(1)::int') + ' as count FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
					break;
			}
			break;
		case 'query':
			query = opt.table;
			break;
	}

	if (exec === 'find' || exec === 'read' || exec === 'list' || exec === 'query') {

		if (opt.sort) {
			query += ' ORDER BY ';
			for (var item of opt.sort) {
				index = item.lastIndexOf('_');
				query += item.substring(0, index) + ' ' + (item.substring(index + 1) === 'desc' ? 'DESC' : 'ASC');
			}
		}

		if (opt.take && opt.skip)
			query += ' LIMIT ' + opt.take + ' OFFSET ' + opt.skip;
		else if (opt.take)
			query += ' LIMIT ' + opt.take;
		else if (opt.skip)
			query += ' OFFSET ' + opt.skip;
	}

	model.query = query;
	model.params = params;

	return model;
}

function PG_ESCAPE(value) {

	if (value == null)
		return 'null';

	var type = typeof(value);

	if (type === 'function') {
		value = value();
		if (value == null)
			return 'null';
		type = typeof(value);
	}

	if (type === 'boolean')
		return value === true ? 'true' : 'false';

	if (type === 'number')
		return value.toString();

	if (type === 'string')
		return pg_escape(value);

	if (value instanceof Array)
		return pg_escape(value.join(','));

	if (value instanceof Date)
		return pg_escape(dateToString(value));

	return pg_escape(value.toString());
}

// Author: https://github.com/segmentio/pg-escape
// License: MIT
function pg_escape(val) {
	if (val == null)
		return 'NULL';
	var backslash = ~val.indexOf('\\');
	var prefix = backslash ? 'E' : '';
	val = val.replace(REG_PG_ESCAPE_1, '\'\'').replace(REG_PG_ESCAPE_2, '\\\\');
	return prefix + '\'' + val + '\'';
}

function dateToString(dt) {

	var arr = [];

	arr.push(dt.getFullYear().toString());
	arr.push((dt.getMonth() + 1).toString());
	arr.push(dt.getDate().toString());
	arr.push(dt.getHours().toString());
	arr.push(dt.getMinutes().toString());
	arr.push(dt.getSeconds().toString());

	for (var i = 1; i < arr.length; i++) {
		if (arr[i].length === 1)
			arr[i] = '0' + arr[i];
	}

	return arr[0] + '-' + arr[1] + '-' + arr[2] + ' ' + arr[3] + ':' + arr[4] + ':' + arr[5];
}

Pg.types.setTypeParser(1700, val => val == null ? null : +val);
global.PG_ESCAPE = PG_ESCAPE;

exports.init = function(name, connstring, pooling) {

	if (!name)
		name = 'default';

	if (!connstring) {
		if (POOLS[name]) {
			POOLS[name].end();
			delete POOLS[name];
		}
		return;
	}

	NEWDB(name, function(filter, callback) {
		if (pooling) {
			if (!POOLS[name])
				POOLS[name] = new Pg.Pool({ connectionString: connstring, max: pooling });
			POOLS[name].connect(function(err, client, done) {
				if (err)
					callback(err);
				else
					exec(client, filter, callback, done);
			});
		} else {
			var client = new Pg.Client({ connectionString: connstring });
			client.connect();
			exec(client, filter, callback, () => client.end());
		}
	});
};