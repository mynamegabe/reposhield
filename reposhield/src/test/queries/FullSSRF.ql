import python
import semmle.python.security.dataflow.ServerSideRequestForgeryQuery
import FullServerSideRequestForgeryFlow::PathGraph

from
  FullServerSideRequestForgeryFlow::PathNode source,
  FullServerSideRequestForgeryFlow::PathNode sink, Http::Client::Request request
where
  request = sink.getNode().(Sink).getRequest() and
  FullServerSideRequestForgeryFlow::flowPath(source, sink) and
  fullyControlledRequest(request)
select request, source, sink, "The full URL of this request depends on a $@.", source.getNode(),
  "user-provided value"
