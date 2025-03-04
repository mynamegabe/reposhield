// Stored XSS
package main

import (
	"io"
	"io/ioutil"
	"net/http"
)

func ListFiles(w http.ResponseWriter, r *http.Request) {
	files, _ := ioutil.ReadDir(".")

	for _, file := range files {
		io.WriteString(w, file.Name()+"\n")
	}
}


// Hardcoded Credentials
package main

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

const (
	user     = "dbuser"
	password = "s3cretp4ssword"
)

func connect() *sql.DB {
	connStr := fmt.Sprintf("postgres://%s:%s@localhost/pqgotest", user, password)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil
	}
	return db
}


// Request Forgery
package main

import (
	"net/http"
)

func handler(w http.ResponseWriter, req *http.Request) {
	target := req.FormValue("target")

	// BAD: `target` is controlled by the attacker
	resp, err := http.Get("https://" + target + ".example.com/data/")
	if err != nil {
		// error handling
	}

	// process request response
	use(resp)
}