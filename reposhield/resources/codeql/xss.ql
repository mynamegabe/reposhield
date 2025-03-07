/**
 * @name Flask XSS
 * @description Detects potential Cross-Site Scripting (XSS) vulnerabilities in Flask applications.
 * @kind path-problem
 * @problem.severity error
 * @id python/flask-xss
 * @tags security
 * @precision high
 */

 import python
 import semmle.python.web.Flask
 import semmle.python.dataflow.TaintTracking
 import DataFlow::PathGraph
 
 class FlaskXSS extends TaintTracking::Configuration {
   FlaskXSS() {
     this = "Flask XSS"
   }
 
   override predicate isSource(DataFlow::Node source) {
     exists(Flask::RequestParamAccess access |
       source.asExpr() = access.getAnInput()
     )
   }
 
   override predicate isSink(DataFlow::Node sink) {
     exists(FunctionCall call |
       call.getTarget().getName() = "render_template" and
       sink.asExpr() = call.getArgument(1) // Context variables start at index 1
     )
   }
 }
 
 from FlaskXSS config, DataFlow::PathNode source, DataFlow::PathNode sink
 where config.hasFlowPath(source, sink)
 select sink, "Potential XSS vulnerability due to untrusted input."