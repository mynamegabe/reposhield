import go
import semmle.go.security.StoredXss
import StoredXss::Flow::PathGraph

from StoredXss::Flow::PathNode source, StoredXss::Flow::PathNode sink
where StoredXss::Flow::flowPath(source, sink)
select sink.getNode(), source, sink, "Stored cross-site scripting vulnerability due to $@.",
  source.getNode(), "stored value"
