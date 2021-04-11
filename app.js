"use strict";
const createError = require("http-errors"), express = require("express"), path = require("path"), cookieParser = require("cookie-parser"), logger = require("morgan"), cors = require("cors"), mysql = require("mysql2"), crypto = require("crypto"), debug = require("debug")("aquasafe20xxapi:server"), http = require("http"), config = require("./config.json");
// Database connections
let userDB = mysql.createPool({
    host: config.database.hostname,
    user: config.database.name,
    password: config.database.pass,
    database: "userdata",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
let sampleDB = mysql.createPool({
    host: config.database.hostname,
    user: config.database.name,
    password: config.database.pass,
    database: "samples",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
//Funny functions
function tokenGen(name, pass) {
    const hash = crypto.createHash("sha3-224");
    hash.update(name + pass + Date.now());
    return hash.digest("hex");
}
// Web stuff
let app = express();
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
// Middleware
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.get("/tea", (ignore, res) => {
    res.status(418).send("I'm a little Teapot, Short and stout");
});
app.get("/*", (req, res) => {
    res.render("index");
});
//User info endpoints
// User login call returns a token to the use that the user can store and use for transactions with the server
app.post("/users/login", (req, res) => {
    // console.log(req.body)
    let login = req.body;
    const name = login["name"];
    const password = login["password"];
    let response = { auth: false };
    console.info(login);
    if (password.length === 56 && name !== "")
        userDB.query("SELECT name, pass from users WHERE name in ('" + name + "')", (err, results) => {
            if (err)
                throw err;
            results = JSON.parse(JSON.stringify(results));
            if (results.length === 0) {
                response.auth = false;
                response.msg = "403";
            }
            else if (results[0]["pass"] === password &&
                results[0]["name"] === name) {
                response.auth = true;
                response.token = tokenGen(name, password);
                response.msg = "200";
                userDB.query("UPDATE users SET token = '" +
                    response.token +
                    "' WHERE name = '" +
                    name +
                    "';", (err) => {
                    if (err)
                        throw err;
                });
            }
            else {
                response.auth = false;
                response.msg = "403";
            }
            res.status(parseInt(response.msg.substr(0, 4), 10)).send(JSON.stringify(response));
        });
    else {
        response.auth = false;
        response.msg = "400";
        res.status(400).send(JSON.stringify(response));
    }
});
// User registration
app.post("/users/register", (req, res) => {
    // console.log(req.body)
    let registration = req.body;
    let response = { auth: false };
    let name = registration["name"];
    let password = registration["password"];
    if (password.length === 56 && name !== "") {
        userDB.query("SELECT name from users WHERE name in ('" + name + "')", (err, results) => {
            if (err)
                throw err;
            results = JSON.parse(JSON.stringify(results));
            if (results.length === 0) {
                response.token = tokenGen(name, password);
                userDB.query("INSERT INTO users(name, pass, token, `group`) values " +
                    "('" +
                    name +
                    "', '" +
                    password +
                    "', '" +
                    response.token +
                    " ', '" +
                    name +
                    "');", (err) => {
                    if (err)
                        throw err;
                });
                response.auth = true;
                res.status(200).send(JSON.stringify(response));
            }
            else {
                response.auth = false;
                response.msg =
                    "403: Account already exists with that name.";
                res.status(403).send(JSON.stringify(response));
            }
        });
    }
    else {
        response.auth = false;
        response.msg = "400: Bad request";
        res.status(400).send(JSON.stringify(response));
    }
});
// Token validation
app.post("/users/validate", (req, res) => {
    let token = req.body["token"];
    let response = { auth: false };
    if (token.length === 56)
        userDB.query("SELECT name, `group` from users WHERE token in ('" + token + "');", (err, results) => {
            if (err)
                throw err;
            results = JSON.parse(JSON.stringify(results));
            if (results.length === 1) {
                response.auth = true;
                response.msg = "200: OK";
            }
            else {
                response.msg = "403: Invalid";
            }
            res.status(parseInt(response.msg.substr(0, 2), 10)).send(JSON.stringify(response));
        });
    else {
        response.msg = "400: Bad request";
        res.status(parseInt(response.msg.substr(0, 2), 10)).send(JSON.stringify(response));
    }
});
// SampleData endpoints
app.post("/samples/list", (req, res) => {
    let request = req.body;
    let response = { auth: false };
    const authToken = request["token"];
    if (authToken.length === 56)
        userDB.query("SELECT name, `group` FROM users WHERE token = '" + authToken + "';", (err, results) => {
            if (err)
                throw err;
            results = JSON.parse(JSON.stringify(results));
            if (results.length === 0) {
                response.msg = "401";
                res.status(401).send(JSON.stringify(response));
            }
            else
                sampleDB.query("SELECT t.*" +
                    "FROM samples.samples t WHERE owner = '" + results[0]["name"] + "' " +
                    "ORDER BY id DESC", (err, results) => {
                    if (err)
                        throw err;
                    results = JSON.parse(JSON.stringify(results));
                    response.results = results;
                    response.auth = true;
                });
        });
    else {
        response.msg = "400";
        res.status(400).send(JSON.stringify(response));
    }
});
app.post("/samples/new", (req, res) => {
    let token = req.body["token"];
    let response = { auth: false };
    if (token.length === 56)
        userDB.query("SELECT name, `group` from users WHERE token in ('" + token + "');", (err, results) => {
            if (err)
                throw err;
            results = JSON.parse(JSON.stringify(results));
            console.log(results);
            if (results.length === 1) {
                sampleDB.query("INSERT INTO samples (owner, `group`, name, ph, hardness, color, location) VALUES " +
                    "('" + results[0]["name"] + "', '" + results[0]["group"] + "', '" + req.body["sample"]["name"] + "', " +
                    req.body["sample"]["pH"] + ", " + req.body["sample"]["hardness"] + ", " + req.body["sample"]["color"] +
                    ", " + req.body["sample"]["location"] + ")", (err) => {
                    if (err)
                        throw err;
                    response.auth = true;
                    response.msg = "200: Submitted";
                    res.status(parseInt(response.msg.substr(0, 3), 10)).send(JSON.stringify(response));
                });
            }
            else {
                response.msg = "403: Invalid";
                res.status(parseInt(response.msg.substr(0, 3), 10)).send(JSON.stringify(response));
            }
        });
    else {
        response.msg = "400: Bad request";
        res.status(parseInt(response.msg.substr(0, 3), 10)).send(JSON.stringify(response));
    }
});
// Actually hosting the app
// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});
// error handler
app.use(function (err, req, res) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};
    // render the error page
    res.status(err.status || 500);
    res.render("error");
});
/**
 * Get port from environment and store in Express.
 */
let port = normalizePort(process.env.PORT || "3000");
app.set("port", port);
/**
 * Create HTTP server.
 */
const server = http.createServer(app);
/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port);
server.on("error", onError);
server.on("listening", onListening);
/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    let port = parseInt(val, 10);
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    if (port >= 0) {
        // port number
        return port;
    }
    return false;
}
/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
    if (error.syscall !== "listen") {
        throw error;
    }
    let bind = typeof port === "string" ? "Pipe " + port : "Port " + port;
    // handle specific listen errors with friendly messages
    switch (error.code) {
        case "EACCES":
            console.error(bind + " requires elevated privileges");
            process.exit(1);
            break;
        case "EADDRINUSE":
            console.error(bind + " is already in use");
            process.exit(1);
            break;
        default:
            throw error;
    }
}
/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
    let addr = server.address();
    let bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    debug("Listening on " + bind);
}
module.exports = {};
//# sourceMappingURL=app.js.map