/**
 * @name Flask Insecure Deserialization
 * @description Detects potential insecure deserialization vulnerabilities in Flask applications.
 * @kind path-problem
 * @problem.severity error
 * @id python/flask-insecure-deserialization
 * @tags security
 * @precision high
 */

 import python
 import semmle.python.web.Flask
 import semmle.python.dataflow.TaintTracking
 import DataFlow::PathGraph
 
 class FlaskInsecureDeserialization extends TaintTracking::Configuration {
   FlaskInsecureDeserialization() {
     this = "Flask Insecure Deserialization"
   }
 
   override predicate isSource(DataFlow::Node source) {
     exists(Flask::RequestParamAccess access |
       source.asExpr() = access.getAnInput()
     )
   }
 
   override predicate isSink(DataFlow::Node sink) {
     exists(FunctionCall call |
       call.getTarget().getName() = "pickle.loads" and
       sink.asExpr() = call.getArgument(0)
     )
   }
 }
 
 from FlaskInsecureDeserialization config, DataFlow::PathNode source, DataFlow::PathNode sink
 where config.hasFlowPath(source, sink)
 select sink, "Potential insecure deserialization vulnerability due to untrusted input."