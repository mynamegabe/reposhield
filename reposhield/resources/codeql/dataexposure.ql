/**
 * @name Flask Sensitive Data Exposure
 * @description Detects potential sensitive data exposure vulnerabilities in Flask applications.
 * @kind path-problem
 * @problem.severity error
 * @id python/flask-sensitive-data-exposure
 * @tags security
 * @precision high
 */

 import python
 import semmle.python.web.Flask
 import semmle.python.dataflow.TaintTracking
 import DataFlow::PathGraph
 
 class FlaskSensitiveDataExposure extends TaintTracking::Configuration {
   FlaskSensitiveDataExposure() {
     this = "Flask Sensitive Data Exposure"
   }
 
   override predicate isSource(DataFlow::Node source) {
     exists(Flask::RequestParamAccess access |
       source.asExpr() = access.getAnInput()
     )
   }
 
   override predicate isSink(DataFlow::Node sink) {
     exists(FunctionCall call |
       call.getTarget().getName().matches("%log%") or
       call.getTarget().getName() = "print" and
       sink.asExpr() = call.getArgument(0)
     )
   }
 }
 
 from FlaskSensitiveDataExposure config, DataFlow::PathNode source, DataFlow::PathNode sink
 where config.hasFlowPath(source, sink)
 select sink, "Potential sensitive data exposure vulnerability due to untrusted input."