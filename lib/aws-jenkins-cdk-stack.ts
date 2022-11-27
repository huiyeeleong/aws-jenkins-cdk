import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { MinimumHealthyHosts } from 'aws-cdk-lib/aws-codedeploy';
import { Port } from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as efs from 'aws-cdk-lib/aws-efs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { Construct } from 'constructs';


export class AwsJenkinsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const jenkinsHomeDir: string = 'jenkins-home';
    const appName: string = 'jenkins-cdk';


    //Setup your Amazon ECS, which is a logical grouping of tasks or services and set vpc
    const cluster = new ecs.Cluster(this, `${appName}-cluster`, {
      clusterName: appName
    });

    const vpc = cluster.vpc;
    
    //Setup Amazon EFS to store the data
    const fileSystem = new efs.FileSystem(this, `${appName}-efs`, {
      vpc: vpc,
      fileSystemName: appName,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // /Setup Access Point, which are application-specific entry points into an Amazon EFS file system 
    // that makes it easier to manage application access to shared datasets
    const accessPoint = fileSystem.addAccessPoint(`${appName}-ap`, {
      path: '/${jenkinsHomeDir}',
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
    });

    //Setup Task Definition to run Docker containers in Amazon ECS
    const taskDefinition = new ecs.FargateTaskDefinition(this, `${appName}-task`,{
      family: appName,
      cpu: 1024,
      memoryLimitMiB: 2048
    });

    //Setup a Volume mapping the Amazon EFS from above to the Task Definition
    taskDefinition.addVolume({
      name: jenkinsHomeDir,
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: accessPoint.accessPointId,
          iam: 'ENABLED',
        },
      },
    });

    //Setup the Container using the Task Definition and the Jenkins image from the registry
    const containerDefinition = taskDefinition.addContainer(appName, {
      image: ecs.ContainerImage.fromRegistry('jenkins/jenkins"lts'),
      logging: ecs.LogDrivers.awsLogs({streamPrefix: 'jenkins'}),
      portMappings: [{containerPort: 8080}]
    });

    //Setup Mount Points to bind ephemeral storage to the container
    containerDefinition.addMountPoints({
      containerPath: '/var/jenkins_home',
      sourceVolume: jenkinsHomeDir,
      readOnly: false,
    });

    //Setup Fargate Service to run the container serverless
    const fargateService = new ecs.FargateService(this, `${appName}-service`, {
      serviceName: appName,
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      maxHealthyPercent: 100,
      minHealthyPercent: 0,
      healthCheckGracePeriod: Duration.minutes(5),
    });
    fargateService.connections.allowTo(fileSystem, Port.tcp(2049));

    //Setup ALB and add listener to checks for connection requests, using the protocol and port that you configure.
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, `${appName}-elb`,
      {
        loadBalancerName: appName,
        vpc: vpc,
        internetFacing: true,
      }
    );
    const lbListener = loadBalancer.addListener(`${appName}-listener`, {
      port: 80,
    });

    const loadBalancerTarget = lbListener.addTargets(`${appName}-target`,{
      port: 8080,
      targets: [fargateService],
      deregistrationDelay: Duration.seconds(10),
      healthCheck: {path: '/login'}
    })
  }
}
